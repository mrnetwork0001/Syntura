import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  connectWallet,
  getReadProvider,
  getContracts,
  isLiveChainConfigured,
  usdToWei,
  weiToUsd,
  BOTCHAIN,
  DEPLOY_BLOCK,
} from "../lib/chain.js";

const SynturaContext = createContext(null);

/**
 * Global protocol state, backed entirely by BOTChain Mainnet.
 *
 * Every read comes from the deployed contracts (invoice structs, vault
 * accounting, event logs) and every action is a wallet-signed transaction -
 * there are no simulated writes and no seeded data. Until contract addresses
 * are configured in .env the store exposes an explicitly empty state
 * (`configured: false`) so the UI can say so instead of pretending.
 *
 * Store API (stable - consumed by every page):
 *   invoices, vault, auditLog, sentries, wallet, liveMode, configured,
 *   loading, chainError, clearChainError(),
 *   connect(), refresh(), tokenizeInvoice(payload, underwriting),
 *   startStream(id), settleInvoice(id), depositLiquidity(amountUSD),
 *   withdrawYield()
 */

const EMPTY_VAULT = {
  totalLiquidityUSD: 0,
  activeStreamsUSD: 0,
  averageYieldAPY: 0, // lifetime pool return % (fees / deposits)
  poolUtilizationPct: 0,
  providers: 0,
  yourDepositUSD: 0,
  yourYieldUSD: 0,
  feeSplit: { supplierPct: 90, poolPct: 7, treasuryPct: 3 },
};

const STATUS = (inv, streamedWei) => {
  if (inv.isSettled) return "Settled";
  if (streamedWei > 0n) return "Streaming";
  if (inv.isUnderwritten) return "Underwritten";
  return "Pending";
};

function parseMetadata(uri) {
  try {
    return JSON.parse(uri);
  } catch {
    return {};
  }
}

function friendlyChainError(err, fallback) {
  if (err?.code === "ACTION_REJECTED") return "Transaction rejected in wallet.";
  if (err?.reason) return `Reverted: ${err.reason}`;
  if (err?.shortMessage) return err.shortMessage;
  return err?.message?.slice(0, 140) || fallback;
}

export function SynturaProvider({ children }) {
  const liveMode = isLiveChainConfigured();

  const [invoices, setInvoices] = useState([]);
  const [vault, setVault] = useState(EMPTY_VAULT);
  const [auditLog, setAuditLog] = useState([]);
  const [sentries, setSentries] = useState([]);
  const [wallet, setWallet] = useState({
    address: null,
    connecting: false,
    balanceBOT: null,
  });
  const [loading, setLoading] = useState(liveMode);
  const [chainError, setChainError] = useState(null);

  const signerRef = useRef(null);
  const readProviderRef = useRef(null);
  if (!readProviderRef.current) {
    readProviderRef.current = getReadProvider();
  }

  const clearChainError = useCallback(() => setChainError(null), []);

  // True while the current chainError came from a failed RPC read (vs a
  // wallet/network warning), so refresh success only clears its own errors.
  const readErrorRef = useRef(false);

  /** Full chain re-read: invoices, vault accounting, events, sentries. */
  const refresh = useCallback(
    async (addressOverride) => {
      if (!liveMode) return;
      const provider = readProviderRef.current;
      const { invoiceNFT, vault: vaultC, sentryRegistry } = getContracts(provider);
      const address = addressOverride ?? wallet.address;
      try {
        const [totalRaw, totalDepWei, outstandingWei, feesWei, provCount] =
          await Promise.all([
            invoiceNFT.totalInvoices(),
            vaultC.totalLiquidity(),
            vaultC.totalOutstandingAdvances(),
            vaultC.totalPoolFeesAccrued(),
            vaultC.providerCount(),
          ]);
        const total = Number(totalRaw);

        // ── Events (audit trail + per-invoice tx hashes + timestamps) ──
        const [
          minted,
          underwritten,
          streamed,
          settled,
          deposited,
          withdrawn,
          yieldPulled,
          sentriesReg,
          commits,
        ] = await Promise.all([
          invoiceNFT.queryFilter(invoiceNFT.filters.InvoiceMinted(), DEPLOY_BLOCK),
          invoiceNFT.queryFilter(invoiceNFT.filters.InvoiceUnderwritten(), DEPLOY_BLOCK),
          vaultC.queryFilter(vaultC.filters.PayoutStreamed(), DEPLOY_BLOCK),
          vaultC.queryFilter(vaultC.filters.SettlementExecuted(), DEPLOY_BLOCK),
          vaultC.queryFilter(vaultC.filters.LiquidityDeposited(), DEPLOY_BLOCK),
          vaultC.queryFilter(vaultC.filters.LiquidityWithdrawn(), DEPLOY_BLOCK),
          vaultC.queryFilter(vaultC.filters.YieldWithdrawn(), DEPLOY_BLOCK),
          sentryRegistry
            ? sentryRegistry.queryFilter(sentryRegistry.filters.SentryRegistered(), DEPLOY_BLOCK)
            : [],
          sentryRegistry
            ? sentryRegistry.queryFilter(sentryRegistry.filters.RiskScoreCommitted(), DEPLOY_BLOCK)
            : [],
        ]);

        const blockNums = [
          ...new Set(
            [...minted, ...underwritten, ...streamed, ...settled, ...deposited, ...withdrawn, ...yieldPulled]
              .map((e) => e.blockNumber)
          ),
        ];
        const blocks = await Promise.all(blockNums.map((n) => provider.getBlock(n)));
        const tsOf = Object.fromEntries(blocks.map((b) => [b.number, b.timestamp]));
        const iso = (e) => new Date(tsOf[e.blockNumber] * 1000).toISOString();

        const mintByInvoice = Object.fromEntries(
          minted.map((e) => [Number(e.args.invoiceId), e])
        );

        // ── Invoice book ──
        const ids = Array.from({ length: total }, (_, i) => i + 1);
        const book = await Promise.all(
          ids.map(async (id) => {
            const [inv, streamedWei, uri] = await Promise.all([
              invoiceNFT.getInvoice(id),
              vaultC.streamedOf(id),
              invoiceNFT.tokenURI(id).catch(() => ""),
            ]);
            const meta = parseMetadata(uri);
            const mintEvt = mintByInvoice[id];
            const mintTs = mintEvt ? tsOf[mintEvt.blockNumber] * 1000 : Date.now();
            const dueMs = Number(inv.dueDate) * 1000;
            return {
              id,
              supplier: inv.supplier,
              supplierName: meta.supplierName || "Onchain supplier",
              debtorName: inv.debtorName,
              faceValueUSD: weiToUsd(inv.faceValueUSD),
              dueDate: new Date(dueMs).toISOString().slice(0, 10),
              termDays:
                meta.termDays ??
                Math.max(1, Math.ceil((dueMs - mintTs) / 86_400_000)),
              sector: meta.sector || "Uncategorized",
              riskScore: Number(inv.riskScore),
              fraudProbability: meta.fraudProbability ?? 0,
              docHash: meta.docHash || null,
              docName: meta.docName || null,
              discountRateBps: Number(inv.discountRateBps),
              status: STATUS(inv, streamedWei),
              streamedPct: streamedWei > 0n || inv.isSettled ? 100 : 0,
              txHash: mintEvt?.transactionHash || "",
              mintedAt: new Date(mintTs).toISOString().slice(0, 10),
            };
          })
        );

        // ── Audit log from real events ──
        const entries = [];
        const push = (e, type, label, detail) =>
          entries.push({
            id: `${e.transactionHash}-${e.index ?? e.logIndex ?? 0}`,
            ts: iso(e),
            type,
            label,
            detail,
            txHash: e.transactionHash,
            blockNumber: e.blockNumber,
          });
        for (const e of minted)
          push(
            e, "MINT",
            `Invoice #${e.args.invoiceId} tokenized as RWA NFT on BOTChain`,
            `Face value $${weiToUsd(e.args.faceValueUSD).toLocaleString()} · supplier ${e.args.supplier.slice(0, 6)}…${e.args.supplier.slice(-4)}`
          );
        for (const e of underwritten)
          push(
            e, "AI_UNDERWRITE",
            `AI Sentry underwrote Invoice #${e.args.invoiceId} - risk ${e.args.riskScore}/100 @ ${(Number(e.args.discountRateBps) / 100).toFixed(2)}%`,
            `Audit hash ${e.args.auditHash.slice(0, 10)}… committed onchain`
          );
        for (const e of streamed)
          push(
            e, "STREAM",
            `Advance streamed for Invoice #${e.args.invoiceId}`,
            `$${weiToUsd(e.args.amount).toLocaleString()} paid to ${e.args.supplier.slice(0, 6)}…${e.args.supplier.slice(-4)}`
          );
        for (const e of settled)
          push(
            e, "SETTLEMENT",
            `Invoice #${e.args.invoiceId} settled - 90/7/3 fee split executed`,
            `Supplier $${weiToUsd(e.args.supplierPayout).toLocaleString()} · Pool $${weiToUsd(e.args.poolFee).toLocaleString()} · Treasury $${weiToUsd(e.args.treasuryFee).toLocaleString()}`
          );
        for (const e of deposited)
          push(
            e, "DEPOSIT",
            `Liquidity deposit - $${weiToUsd(e.args.amount).toLocaleString()} into streaming vault`,
            `Provider ${e.args.provider.slice(0, 6)}…${e.args.provider.slice(-4)}`
          );
        for (const e of withdrawn)
          push(
            e, "WITHDRAW",
            `Principal withdrawn - $${weiToUsd(e.args.amount).toLocaleString()} returned`,
            `Provider ${e.args.provider.slice(0, 6)}…${e.args.provider.slice(-4)}`
          );
        for (const e of yieldPulled)
          push(
            e, "WITHDRAW",
            `Yield withdrawn - $${weiToUsd(e.args.amount).toLocaleString()} paid out`,
            `Pro-rata settlement fees · provider ${e.args.provider.slice(0, 6)}…${e.args.provider.slice(-4)}`
          );
        entries.sort((a, b) => b.blockNumber - a.blockNumber || (a.ts < b.ts ? 1 : -1));

        // ── Sentry registry ──
        const commitCount = {};
        for (const e of commits) {
          const a = e.args.agent.toLowerCase();
          commitCount[a] = (commitCount[a] || 0) + 1;
        }
        const sentryList = sentriesReg.map((e) => ({
          address: e.args.agent,
          modelId: e.args.modelId,
          commitments: commitCount[e.args.agent.toLowerCase()] || 0,
          verified: true,
        }));

        // ── Vault stats (+ per-wallet position) ──
        let yourDepositWei = 0n;
        let yourYieldWei = 0n;
        if (address) {
          let balanceWei = 0n;
          [yourDepositWei, yourYieldWei, balanceWei] = await Promise.all([
            vaultC.depositOf(address),
            vaultC.yieldOf(address),
            provider.getBalance(address),
          ]);
          setWallet((w) =>
            w.address === address
              ? { ...w, balanceBOT: Number(balanceWei) / 1e18 }
              : w
          );
        }
        const totalDepUSD = weiToUsd(totalDepWei);
        setVault({
          totalLiquidityUSD: totalDepUSD,
          activeStreamsUSD: weiToUsd(outstandingWei),
          averageYieldAPY:
            totalDepWei > 0n ? (weiToUsd(feesWei) / totalDepUSD) * 100 : 0,
          poolUtilizationPct:
            totalDepWei > 0n
              ? Number((outstandingWei * 10_000n) / totalDepWei) / 100
              : 0,
          providers: Number(provCount),
          yourDepositUSD: weiToUsd(yourDepositWei),
          yourYieldUSD: weiToUsd(yourYieldWei),
          feeSplit: { supplierPct: 90, poolPct: 7, treasuryPct: 3 },
        });
        setInvoices(book.reverse());
        setAuditLog(entries);
        setSentries(sentryList);
        // Only clear an error refresh itself raised - never wipe wallet or
        // wrong-network warnings just because the RPC reads succeeded.
        if (readErrorRef.current) {
          readErrorRef.current = false;
          setChainError(null);
        }
      } catch (err) {
        readErrorRef.current = true;
        setChainError(friendlyChainError(err, "Failed to read BOTChain state."));
      } finally {
        setLoading(false);
      }
    },
    [liveMode, wallet.address]
  );

  // Initial load + light polling while live.
  useEffect(() => {
    if (!liveMode) return undefined;
    refresh();
    const t = setInterval(refresh, 45_000);
    return () => clearInterval(t);
  }, [liveMode, refresh]);

  const connect = useCallback(async () => {
    setWallet((w) => ({ ...w, connecting: true }));
    try {
      const res = await connectWallet();
      if (!res) {
        setWallet({ address: null, connecting: false, balanceBOT: null });
        setChainError("No wallet detected - install MetaMask (or any injected wallet) to transact.");
        return null;
      }
      if (!res.chainOk) {
        setChainError(
          res.rejected
            ? `Network switch declined - Syntura only transacts on ${BOTCHAIN.name} (chain ${BOTCHAIN.chainId}). Approve the prompt in your wallet to continue.`
            : `Your wallet is on the wrong network - approve the ${BOTCHAIN.name} (chain ${BOTCHAIN.chainId}) add/switch prompt to transact.`
        );
      }
      signerRef.current = res.signer;
      const balanceWei = await readProviderRef.current
        .getBalance(res.address)
        .catch(() => 0n);
      setWallet({
        address: res.address,
        connecting: false,
        balanceBOT: Number(balanceWei) / 1e18,
      });
      if (liveMode) refresh(res.address);
      return res.address;
    } catch (err) {
      setWallet({ address: null, connecting: false, balanceBOT: null });
      setChainError(friendlyChainError(err, "Wallet connection failed."));
      return null;
    }
  }, [liveMode, refresh]);

  /** Clears the local session - injected wallets have no true "disconnect". */
  const disconnect = useCallback(() => {
    signerRef.current = null;
    setWallet({ address: null, connecting: false, balanceBOT: null });
  }, []);

  // Track the connected address across renders for the wallet event listeners.
  const addressRef = useRef(null);
  useEffect(() => {
    addressRef.current = wallet.address;
  }, [wallet.address]);

  // Follow the wallet: rebuild the session when the user switches account or
  // lands on BOTChain, and surface a clear error when they switch away.
  useEffect(() => {
    const eth = typeof window !== "undefined" ? window.ethereum : null;
    if (!eth?.on) return undefined;
    const onChainChanged = (hexId) => {
      if (Number(hexId) === BOTCHAIN.chainId) {
        setChainError(null);
        if (addressRef.current) connect();
      } else if (addressRef.current) {
        setChainError(
          `Wallet moved to chain ${Number(hexId)} - switch back to ${BOTCHAIN.name} (chain ${BOTCHAIN.chainId}) to transact.`
        );
      }
    };
    const onAccountsChanged = (accounts) => {
      if (!accounts?.length) disconnect();
      else if (addressRef.current) connect();
    };
    eth.on("chainChanged", onChainChanged);
    eth.on("accountsChanged", onAccountsChanged);
    return () => {
      eth.removeListener?.("chainChanged", onChainChanged);
      eth.removeListener?.("accountsChanged", onAccountsChanged);
    };
  }, [connect, disconnect]);

  /** Signer-bound contracts; connects the wallet first if needed. */
  const requireSigner = useCallback(async () => {
    if (!liveMode) {
      throw new Error(
        "Contracts are not deployed yet - run `npm run deploy:botchain` and set the VITE_*_ADDRESS values in .env."
      );
    }
    if (!signerRef.current) {
      const addr = await connect();
      if (!addr) throw new Error("Connect a BOTChain wallet to transact.");
    }
    return getContracts(signerRef.current);
  }, [liveMode, connect]);

  /**
   * Mint an invoice NFT, then underwrite it onchain with the AI Sentry's
   * verdict and anchor the audit hash in the registry. Throws on failure
   * (MintInvoice surfaces the message).
   */
  const tokenizeInvoice = useCallback(
    async (payload, underwriting) => {
      const { invoiceNFT, sentryRegistry } = await requireSigner();
      const faceWei = usdToWei(payload.faceValueUSD);
      const dueUnix = Math.floor(new Date(payload.dueDate).getTime() / 1000);
      const metadataURI = JSON.stringify({
        supplierName: payload.supplierName,
        sector: payload.sector,
        termDays: Number(payload.termDays),
        fraudProbability: underwriting.fraudProbability,
        model: "syntura-sentry-v1",
        // SHA-256 fingerprint of the underlying invoice document, computed
        // client-side - anchors the real-world document to the token.
        ...(payload.docHash
          ? { docHash: payload.docHash, docName: payload.docName }
          : {}),
      });

      const mintTx = await invoiceNFT.mintInvoice(
        payload.debtorName,
        faceWei,
        dueUnix,
        metadataURI
      );
      const receipt = await mintTx.wait();
      const mintedEvt = receipt.logs
        .map((l) => {
          try {
            return invoiceNFT.interface.parseLog(l);
          } catch {
            return null;
          }
        })
        .find((p) => p?.name === "InvoiceMinted");
      const id = Number(mintedEvt?.args?.invoiceId ?? 0);

      try {
        const uwTx = await invoiceNFT.underwriteInvoice(
          id,
          underwriting.riskScore,
          underwriting.discountRateBps,
          underwriting.auditHash
        );
        await uwTx.wait();
        if (sentryRegistry) {
          const cTx = await sentryRegistry.commitRiskScore(
            id,
            underwriting.riskScore,
            underwriting.auditHash
          );
          await cTx.wait();
        }
      } catch (err) {
        // Mint succeeded; underwriting is gated to registered sentries/owner.
        await refresh();
        throw new Error(
          `Invoice #${id} minted (tx ${receipt.hash.slice(0, 10)}…) but onchain underwriting failed: ${friendlyChainError(err, "sentry not authorized")}. Underwrite from the registered sentry wallet.`
        );
      }

      await refresh();
      return {
        id,
        supplier: wallet.address,
        supplierName: payload.supplierName,
        debtorName: payload.debtorName,
        faceValueUSD: Number(payload.faceValueUSD),
        dueDate: payload.dueDate,
        termDays: Number(payload.termDays),
        sector: payload.sector,
        riskScore: underwriting.riskScore,
        fraudProbability: underwriting.fraudProbability,
        docHash: payload.docHash || null,
        docName: payload.docName || null,
        discountRateBps: underwriting.discountRateBps,
        status: "Underwritten",
        streamedPct: 0,
        txHash: receipt.hash,
        mintedAt: new Date().toISOString().slice(0, 10),
      };
    },
    [requireSigner, refresh, wallet.address]
  );

  /** Streams the pool advance to the supplier. Returns tx hash or null. */
  const startStream = useCallback(
    async (id) => {
      try {
        const { vault: vaultC } = await requireSigner();
        const tx = await vaultC.streamPayout(id);
        const receipt = await tx.wait();
        await refresh();
        return receipt.hash;
      } catch (err) {
        setChainError(friendlyChainError(err, "Streaming transaction failed."));
        return null;
      }
    },
    [requireSigner, refresh]
  );

  /** Settles an invoice - the caller pays face value as the debtor. */
  const settleInvoice = useCallback(
    async (id) => {
      try {
        const { vault: vaultC, invoiceNFT } = await requireSigner();
        const inv = await invoiceNFT.getInvoice(id);
        const tx = await vaultC.settleInvoice(id, { value: inv.faceValueUSD });
        const receipt = await tx.wait();
        await refresh();
        return receipt.hash;
      } catch (err) {
        setChainError(friendlyChainError(err, "Settlement transaction failed."));
        return null;
      }
    },
    [requireSigner, refresh]
  );

  /** Deposits native liquidity (USD-denominated input). */
  const depositLiquidity = useCallback(
    async (amountUSD) => {
      const amount = Number(amountUSD);
      if (!amount || amount <= 0) return null;
      try {
        const { vault: vaultC } = await requireSigner();
        const tx = await vaultC.depositLiquidity({ value: usdToWei(amount) });
        const receipt = await tx.wait();
        await refresh();
        return receipt.hash;
      } catch (err) {
        setChainError(friendlyChainError(err, "Deposit transaction failed."));
        return null;
      }
    },
    [requireSigner, refresh]
  );

  /** Pulls accrued pool-fee yield. */
  const withdrawYield = useCallback(async () => {
    try {
      const { vault: vaultC } = await requireSigner();
      const tx = await vaultC.withdrawYield();
      const receipt = await tx.wait();
      await refresh();
      return receipt.hash;
    } catch (err) {
      setChainError(friendlyChainError(err, "Yield withdrawal failed."));
      return null;
    }
  }, [requireSigner, refresh]);

  const value = useMemo(
    () => ({
      invoices,
      vault,
      auditLog,
      sentries,
      wallet,
      liveMode,
      configured: liveMode,
      loading,
      chainError,
      clearChainError,
      connect,
      disconnect,
      refresh,
      tokenizeInvoice,
      startStream,
      settleInvoice,
      depositLiquidity,
      withdrawYield,
    }),
    [
      invoices,
      vault,
      auditLog,
      sentries,
      wallet,
      liveMode,
      loading,
      chainError,
      clearChainError,
      connect,
      disconnect,
      refresh,
      tokenizeInvoice,
      startStream,
      settleInvoice,
      depositLiquidity,
      withdrawYield,
    ]
  );

  return (
    <SynturaContext.Provider value={value}>{children}</SynturaContext.Provider>
  );
}

export function useSyntura() {
  const ctx = useContext(SynturaContext);
  if (!ctx) throw new Error("useSyntura must be used within SynturaProvider");
  return ctx;
}
