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
  usdToWad,
  wadToUsd,
  usdToUnits,
  unitsToUsd,
  BOTCHAIN,
  CONTRACTS,
  DEPLOY_BLOCK,
} from "../lib/chain.js";
import { underwriteInvoice as runSentryModel } from "../agent/aiSentryAgent.js";

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
 * Underwriting is NOT part of the mint flow: `underwriteInvoice` and
 * `commitRiskScore` are gated to registry-verified sentries, so the supplier
 * only mints and the autonomous sentry service (service/sentry.js) submits the
 * verdict from its own key. `awaitUnderwriting` is how the UI waits for it.
 *
 * UNITS: invoice face value on the NFT is an 18-decimal USD wad (usdToWad /
 * wadToUsd); every USDT amount - vault views, vault events, ERC-20 balances -
 * is 6-decimal token units (usdToUnits / unitsToUsd). The settlement amount is
 * always read from the vault via `faceValueUnits(id)`, never derived here.
 *
 * Money-moving calls are ERC-20 flows: balance check -> allowance check ->
 * exact-amount approve (never unlimited) -> act. `txStep` labels the stage.
 *
 * Store API (stable - consumed by every page):
 *   invoices, vault, auditLog, sentries, wallet, isSentry, liveMode,
 *   configured, loading, chainError, txStep, clearChainError(),
 *   connect(), refresh(), tokenizeInvoice(payload, underwriting),
 *   awaitUnderwriting(id, opts), underwriteAsSentry(id),
 *   startStream(id), settleInvoice(id), depositLiquidity(amountUSD),
 *   withdrawYield()
 */

const EMPTY_VAULT = {
  totalLiquidityUSD: 0,
  activeStreamsUSD: 0,
  availableLiquidityUSD: 0,
  averageYieldAPY: 0, // lifetime pool return % (fees / deposits)
  poolUtilizationPct: 0,
  providers: 0,
  yourDepositUSD: 0,
  yourYieldUSD: 0,
  feeSplit: { supplierPct: 90, poolPct: 7, treasuryPct: 3 },
};

const STATUS = (inv, streamedUnits) => {
  if (inv.isSettled) return "Settled";
  if (streamedUnits > 0n) return "Streaming";
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Token units -> "1,234.50" for error copy. Truncates, never flatters. */
const fmtUSDT = (units) =>
  unitsToUsd(units).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/**
 * Rebuilds the exact model payload for an invoice from chain state + its
 * metadata JSON, so a locally-run verdict is byte-identical to the one the
 * autonomous sentry service computes. Raw (possibly absent) metadata values are
 * passed straight through - the model normalizes them deterministically.
 */
async function buildModelPayload(invoiceNFT, provider, id) {
  const [inv, uri, mintLogs] = await Promise.all([
    invoiceNFT.getInvoice(id),
    invoiceNFT.tokenURI(id).catch(() => ""),
    invoiceNFT
      .queryFilter(invoiceNFT.filters.InvoiceMinted(id), DEPLOY_BLOCK)
      .catch(() => []),
  ]);
  const meta = parseMetadata(uri);
  const mintEvt = mintLogs[mintLogs.length - 1];
  const block = mintEvt
    ? await provider.getBlock(mintEvt.blockNumber).catch(() => null)
    : null;
  // Pin the model's as-of day to the MINT block, exactly as service/sentry.js
  // does. asOf is committed inside the audit hash, so anchoring both runs to
  // the same day is what makes this fallback reproduce the service's verdict
  // rather than a different one just because it ran on a later date.
  const anchorMs = block ? Number(block.timestamp) * 1000 : Date.now();
  const dueMs = Number(inv.dueDate) * 1000;
  let termDays = Number(meta.termDays);
  if (!Number.isFinite(termDays) || termDays <= 0) {
    // Older/foreign metadata: recover the tenor from mint time to due date.
    termDays = Math.max(1, Math.round((dueMs - anchorMs) / 86_400_000));
  }
  return {
    debtorName: inv.debtorName,
    supplierName: meta.supplierName,
    sector: meta.sector,
    faceValueUSD: wadToUsd(inv.faceValueUSD),
    termDays,
    dueDate: new Date(dueMs).toISOString().slice(0, 10),
    asOf: new Date(anchorMs).toISOString().slice(0, 10),
    debtorYearsTrading: meta.debtorYearsTrading,
    priorInvoicesPaid: meta.priorInvoicesPaid,
    priorInvoicesDefaulted: meta.priorInvoicesDefaulted,
  };
}

/** auditHash lives in the event, not the struct - read it back from the log. */
async function auditHashOf(invoiceNFT, id) {
  const logs = await invoiceNFT
    .queryFilter(invoiceNFT.filters.InvoiceUnderwritten(id), DEPLOY_BLOCK)
    .catch(() => []);
  const last = logs[logs.length - 1];
  return last?.args?.auditHash ?? null;
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
  const [protocolStats, setProtocolStats] = useState({
    participants: 0,
    verdicts: 0,
    settlements: 0,
    depositedUSD: 0,
  });
  const [wallet, setWallet] = useState({
    address: null,
    connecting: false,
    balanceBOT: null,
    balanceUSDT: null,
  });
  const [isSentry, setIsSentry] = useState(false);
  const [loading, setLoading] = useState(liveMode);
  const [chainError, setChainError] = useState(null);
  // Stage of the in-flight money transaction, so the UI can name each step:
  // "checking" | "approving" | "depositing" | "settling" | "confirming" | null.
  const [txStep, setTxStep] = useState(null);

  const signerRef = useRef(null);
  const readProviderRef = useRef(null);
  if (!readProviderRef.current) {
    readProviderRef.current = getReadProvider();
  }

  // True while the current chainError came from a failed RPC read (vs a
  // wallet/network warning), so refresh success only clears its own errors.
  const readErrorRef = useRef(false);

  // True while the visible chainError is an "insufficient USDT" abort raised by
  // prepareUSDTSpend. Tracked separately so the next spend attempt can clear its
  // own stale message without wiping a wallet or wrong-network warning.
  const spendErrorRef = useRef(false);

  const clearChainError = useCallback(() => {
    spendErrorRef.current = false;
    setChainError(null);
  }, []);

  /** Full chain re-read: invoices, vault accounting, events, sentries. */
  const refresh = useCallback(
    async (addressOverride) => {
      if (!liveMode) return;
      const provider = readProviderRef.current;
      const {
        invoiceNFT,
        vault: vaultC,
        sentryRegistry,
        usdt,
      } = getContracts(provider);
      const address = addressOverride ?? wallet.address;
      try {
        // Vault amounts are 6-decimal USDT units end to end.
        const [totalRaw, totalDepUnits, outstandingUnits, feesUnits, provCount] =
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
            const [inv, streamedUnits, uri] = await Promise.all([
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
              faceValueUSD: wadToUsd(inv.faceValueUSD),
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
              status: STATUS(inv, streamedUnits),
              streamedPct: streamedUnits > 0n || inv.isSettled ? 100 : 0,
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
        // InvoiceMinted carries the NFT's 18-decimal wad; every vault event
        // below carries 6-decimal USDT units. Do not swap the converters.
        for (const e of minted)
          push(
            e, "MINT",
            `Invoice #${e.args.invoiceId} tokenized as RWA NFT on BOTChain`,
            `Face value $${wadToUsd(e.args.faceValueUSD).toLocaleString()} · supplier ${e.args.supplier.slice(0, 6)}…${e.args.supplier.slice(-4)}`
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
            `$${unitsToUsd(e.args.amount).toLocaleString()} USDT paid to ${e.args.supplier.slice(0, 6)}…${e.args.supplier.slice(-4)}`
          );
        for (const e of settled)
          push(
            e, "SETTLEMENT",
            `Invoice #${e.args.invoiceId} settled - 90/7/3 fee split executed`,
            `Supplier $${unitsToUsd(e.args.supplierPayout).toLocaleString()} · Pool $${unitsToUsd(e.args.poolFee).toLocaleString()} · Treasury $${unitsToUsd(e.args.treasuryFee).toLocaleString()} USDT`
          );
        for (const e of deposited)
          push(
            e, "DEPOSIT",
            `Liquidity deposit - $${unitsToUsd(e.args.amount).toLocaleString()} USDT into streaming vault`,
            `Provider ${e.args.provider.slice(0, 6)}…${e.args.provider.slice(-4)}`
          );
        for (const e of withdrawn)
          push(
            e, "WITHDRAW",
            `Principal withdrawn - $${unitsToUsd(e.args.amount).toLocaleString()} USDT returned`,
            `Provider ${e.args.provider.slice(0, 6)}…${e.args.provider.slice(-4)}`
          );
        for (const e of yieldPulled)
          push(
            e, "WITHDRAW",
            `Yield withdrawn - $${unitsToUsd(e.args.amount).toLocaleString()} USDT paid out`,
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

        // Distinct wallets that have actually used the protocol - suppliers who
        // minted plus providers who supplied liquidity. Sentries are excluded:
        // they are protocol infrastructure, not participants.
        const participants = new Set([
          ...minted.map((e) => e.args.supplier.toLowerCase()),
          ...deposited.map((e) => e.args.provider.toLowerCase()),
          ...withdrawn.map((e) => e.args.provider.toLowerCase()),
        ]);
        // Cumulative capital entrusted to the vault. Deposits only - counting
        // withdrawals too would let the same dollar inflate the figure by
        // cycling in and out.
        let depositedUnits = 0n;
        for (const e of deposited) depositedUnits += e.args.amount;

        setProtocolStats({
          participants: participants.size,
          verdicts: underwritten.length,
          settlements: settled.length,
          depositedUSD: unitsToUsd(depositedUnits),
        });

        // ── Vault stats (+ per-wallet position) ──
        let yourDepositUnits = 0n;
        let yourYieldUnits = 0n;
        if (address) {
          let balanceWei = 0n;
          let usdtUnits = 0n;
          let verifiedSentry = false;
          [yourDepositUnits, yourYieldUnits, balanceWei, usdtUnits, verifiedSentry] =
            await Promise.all([
              vaultC.depositOf(address),
              vaultC.yieldOf(address),
              provider.getBalance(address),
              usdt ? usdt.balanceOf(address).catch(() => 0n) : 0n,
              sentryRegistry
                ? sentryRegistry.isVerifiedSentry(address).catch(() => false)
                : false,
            ]);
          setWallet((w) =>
            w.address === address
              ? {
                  ...w,
                  balanceBOT: Number(balanceWei) / 1e18,
                  balanceUSDT: unitsToUsd(usdtUnits),
                }
              : w
          );
          setIsSentry(Boolean(verifiedSentry));
        } else {
          setIsSentry(false);
        }
        const totalDepUSD = unitsToUsd(totalDepUnits);
        setVault({
          totalLiquidityUSD: totalDepUSD,
          activeStreamsUSD: unitsToUsd(outstandingUnits),
          availableLiquidityUSD: unitsToUsd(totalDepUnits - outstandingUnits),
          // Guard on the rounded USD figure: a sub-cent pool rounds to 0.
          averageYieldAPY:
            totalDepUSD > 0 ? (unitsToUsd(feesUnits) / totalDepUSD) * 100 : 0,
          poolUtilizationPct:
            totalDepUnits > 0n
              ? Number((outstandingUnits * 10_000n) / totalDepUnits) / 100
              : 0,
          providers: Number(provCount),
          yourDepositUSD: unitsToUsd(yourDepositUnits),
          yourYieldUSD: unitsToUsd(yourYieldUnits),
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

  /**
   * Cheap change detector. A full refresh rescans every event since deployment
   * and re-reads every invoice, so polling THAT every few seconds would hammer
   * the RPC. Instead this reads a handful of counters (plus the newest
   * invoice's lifecycle flags, which is how underwriting and settlement show
   * up) and returns a signature string. Same signature means nothing moved.
   */
  const readSignature = useCallback(async () => {
    const { invoiceNFT, vault: vaultC } = getContracts(readProviderRef.current);
    const [total, liquidity, outstanding, fees] = await Promise.all([
      invoiceNFT.totalInvoices(),
      vaultC.totalLiquidity(),
      vaultC.totalOutstandingAdvances(),
      vaultC.totalPoolFeesAccrued(),
    ]);
    let latest = "";
    if (total > 0n) {
      const inv = await invoiceNFT.getInvoice(total);
      latest = `${inv.isUnderwritten}:${inv.isSettled}:${inv.riskScore}`;
    }
    return `${total}|${liquidity}|${outstanding}|${fees}|${latest}`;
  }, []);

  // Initial load, then a 4s tick that only pays for a full refresh when the
  // chain actually changed, plus a 60s safety net in case a change slips
  // through the signature (an older invoice settling, say).
  useEffect(() => {
    if (!liveMode) return undefined;
    let stop = false;
    let busy = false;
    let lastSig = null;
    let sinceFull = 0;

    refresh().then(() => {
      readSignature().then((s) => { lastSig = s; }).catch(() => {});
    });

    const tick = setInterval(async () => {
      // Skip rather than pile up when the RPC is slower than the interval.
      if (stop || busy) return;
      busy = true;
      sinceFull += 4;
      try {
        const sig = await readSignature();
        if (sig !== lastSig || sinceFull >= 60) {
          lastSig = sig;
          sinceFull = 0;
          await refresh();
        }
      } catch {
        // Transient RPC hiccup - the next tick retries.
      } finally {
        busy = false;
      }
    }, 4000);

    return () => {
      stop = true;
      clearInterval(tick);
    };
  }, [liveMode, refresh, readSignature]);

  const connect = useCallback(async () => {
    setWallet((w) => ({ ...w, connecting: true }));
    try {
      const res = await connectWallet();
      if (!res) {
        setWallet({
          address: null,
          connecting: false,
          balanceBOT: null,
          balanceUSDT: null,
        });
        setIsSentry(false);
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
      const { usdt } = getContracts(readProviderRef.current);
      // BOT pays gas; USDT is the money. Both are read on every connect.
      const [balanceWei, usdtUnits] = await Promise.all([
        readProviderRef.current.getBalance(res.address).catch(() => 0n),
        usdt ? usdt.balanceOf(res.address).catch(() => 0n) : Promise.resolve(0n),
      ]);
      setWallet({
        address: res.address,
        connecting: false,
        balanceBOT: Number(balanceWei) / 1e18,
        balanceUSDT: unitsToUsd(usdtUnits),
      });
      if (liveMode) refresh(res.address);
      return res.address;
    } catch (err) {
      setWallet({
        address: null,
        connecting: false,
        balanceBOT: null,
        balanceUSDT: null,
      });
      setIsSentry(false);
      setChainError(friendlyChainError(err, "Wallet connection failed."));
      return null;
    }
  }, [liveMode, refresh]);

  /** Clears the local session - injected wallets have no true "disconnect". */
  const disconnect = useCallback(() => {
    signerRef.current = null;
    setWallet({
      address: null,
      connecting: false,
      balanceBOT: null,
      balanceUSDT: null,
    });
    setIsSentry(false);
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
        "Contracts are not deployed yet - run `npm run deploy:botchain` and set the VITE_*_ADDRESS values (including VITE_USDT_ADDRESS) in .env."
      );
    }
    if (!signerRef.current) {
      const addr = await connect();
      if (!addr) throw new Error("Connect a BOTChain wallet to transact.");
    }
    return getContracts(signerRef.current);
  }, [liveMode, connect]);

  /**
   * Mint an invoice NFT - ONE wallet approval, nothing else. Underwriting is
   * the autonomous sentry's job (it holds the only registry-verified key), so
   * the invoice comes back Pending and the caller waits via awaitUnderwriting.
   * Throws on failure (MintInvoice surfaces the message).
   */
  const tokenizeInvoice = useCallback(
    async (payload, underwriting) => {
      const { invoiceNFT } = await requireSigner();
      // Face value on the NFT is an 18-decimal USD wad, NOT token units.
      const faceWad = usdToWad(payload.faceValueUSD);
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
        faceWad,
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
        riskScore: 0,
        fraudProbability: underwriting.fraudProbability,
        docHash: payload.docHash || null,
        docName: payload.docName || null,
        discountRateBps: 0,
        status: "Pending",
        streamedPct: 0,
        txHash: receipt.hash,
        mintedAt: new Date().toISOString().slice(0, 10),
      };
    },
    [requireSigner, refresh, wallet.address]
  );

  /**
   * Polls the READ provider until the autonomous sentry has underwritten the
   * invoice onchain. Transient RPC failures are swallowed and retried - only
   * the deadline ends the wait.
   */
  const awaitUnderwriting = useCallback(
    async (id, { timeoutMs = 120_000, intervalMs = 4_000 } = {}) => {
      const { invoiceNFT } = getContracts(readProviderRef.current);
      if (!invoiceNFT) return { underwritten: false, timedOut: true };
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        try {
          const inv = await invoiceNFT.getInvoice(id);
          if (inv.isUnderwritten) {
            const auditHash = await auditHashOf(invoiceNFT, id);
            await refresh();
            return {
              underwritten: true,
              riskScore: Number(inv.riskScore),
              discountRateBps: Number(inv.discountRateBps),
              auditHash,
            };
          }
        } catch {
          /* transient RPC error - keep polling until the deadline */
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) return { underwritten: false, timedOut: true };
        await sleep(Math.min(intervalMs, remaining));
      }
    },
    [refresh]
  );

  /**
   * Operator fallback: underwrite from the CONNECTED wallet when it is itself a
   * registry-verified sentry (e.g. the service is down). Reruns the same model
   * over onchain state, then sends underwriteInvoice + commitRiskScore
   * sequentially. Returns the underwriting tx hash, or null with a chainError.
   */
  const underwriteAsSentry = useCallback(
    async (id) => {
      try {
        const { invoiceNFT, sentryRegistry } = await requireSigner();
        const address = await signerRef.current.getAddress();
        const provider = readProviderRef.current;
        const { sentryRegistry: registryRead } = getContracts(provider);
        const verified = registryRead
          ? await registryRead.isVerifiedSentry(address)
          : false;
        setIsSentry(Boolean(verified));
        if (!verified) {
          setChainError(
            `Wallet ${address.slice(0, 6)}…${address.slice(-4)} is not a verified sentry - the registry owner must call registerSentry(${address}, "syntura-sentry-v1"), or leave Invoice #${id} to the autonomous sentry service.`
          );
          return null;
        }

        const onchain = await invoiceNFT.getInvoice(id);
        if (onchain.isUnderwritten) {
          await refresh();
          return null;
        }

        const verdict = runSentryModel(
          await buildModelPayload(invoiceNFT, provider, id)
        );
        const uwTx = await invoiceNFT.underwriteInvoice(
          id,
          verdict.riskScore,
          verdict.discountRateBps,
          verdict.auditHash
        );
        const receipt = await uwTx.wait();
        if (sentryRegistry) {
          // Sequential on purpose: same signer, nonce order matters.
          const commitTx = await sentryRegistry.commitRiskScore(
            id,
            verdict.riskScore,
            verdict.auditHash
          );
          await commitTx.wait();
        }
        await refresh();
        return receipt.hash;
      } catch (err) {
        setChainError(friendlyChainError(err, "Sentry underwriting failed."));
        return null;
      }
    },
    [requireSigner, refresh]
  );

  /**
   * Prepares an ERC-20 spend of `units` (6-decimal USDT) by `spender`:
   * balance check first so an underfunded wallet is told the shortfall WITHOUT
   * being asked to sign anything, then an approval for the EXACT amount when
   * the standing allowance is short - never an unlimited approval.
   * Returns true when the vault is cleared to pull the funds.
   */
  const prepareUSDTSpend = useCallback(
    async (usdt, spender, units, purpose) => {
      if (!usdt) {
        throw new Error(
          "USDT address is not configured - set VITE_USDT_ADDRESS in .env."
        );
      }
      setTxStep("checking");
      // A fresh balance check supersedes the last shortfall message.
      if (spendErrorRef.current) {
        spendErrorRef.current = false;
        setChainError(null);
      }
      const owner = await signerRef.current.getAddress();
      const balance = await usdt.balanceOf(owner);
      if (balance < units) {
        spendErrorRef.current = true;
        setChainError(
          `Not enough USDT to ${purpose}: need ${fmtUSDT(units)} USDT, wallet holds ${fmtUSDT(balance)} USDT (short ${fmtUSDT(units - balance)} USDT).`
        );
        return false;
      }
      const allowance = await usdt.allowance(owner, spender);
      if (allowance < units) {
        setTxStep("approving");
        const approveTx = await usdt.approve(spender, units);
        await approveTx.wait();
      }
      return true;
    },
    []
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

  /**
   * Settles an invoice - the caller pays face value in USDT as the debtor.
   * The amount comes from the vault's `faceValueUnits(id)`, which is the
   * authoritative wad -> token-unit conversion; recomputing it here would risk
   * approving a different number than the vault pulls.
   */
  const settleInvoice = useCallback(
    async (id) => {
      try {
        const { vault: vaultC, usdt } = await requireSigner();
        setTxStep("checking");
        const units = await vaultC.faceValueUnits(id);
        const cleared = await prepareUSDTSpend(
          usdt,
          CONTRACTS.vault,
          units,
          `settle Invoice #${id}`
        );
        if (!cleared) return null;
        setTxStep("settling");
        const tx = await vaultC.settleInvoice(id);
        setTxStep("confirming");
        const receipt = await tx.wait();
        await refresh();
        return receipt.hash;
      } catch (err) {
        setChainError(friendlyChainError(err, "Settlement transaction failed."));
        return null;
      } finally {
        setTxStep(null);
      }
    },
    [requireSigner, refresh, prepareUSDTSpend]
  );

  /** Deposits USDT liquidity (dollar-denominated input). */
  const depositLiquidity = useCallback(
    async (amountUSD) => {
      const amount = Number(amountUSD);
      if (!amount || amount <= 0) return null;
      try {
        const { vault: vaultC, usdt } = await requireSigner();
        const units = usdToUnits(amount);
        const cleared = await prepareUSDTSpend(
          usdt,
          CONTRACTS.vault,
          units,
          "deposit"
        );
        if (!cleared) return null;
        setTxStep("depositing");
        const tx = await vaultC.depositLiquidity(units);
        setTxStep("confirming");
        const receipt = await tx.wait();
        await refresh();
        return receipt.hash;
      } catch (err) {
        setChainError(friendlyChainError(err, "Deposit transaction failed."));
        return null;
      } finally {
        setTxStep(null);
      }
    },
    [requireSigner, refresh, prepareUSDTSpend]
  );

  /**
   * Returns deposited principal. No approval needed - the vault is sending,
   * not pulling. Capped by availableLiquidity: principal currently financing
   * an outstanding advance cannot leave until that invoice settles.
   */
  const withdrawLiquidity = useCallback(
    async (amountUSD) => {
      const amount = Number(amountUSD);
      if (!amount || amount <= 0) return null;
      try {
        const { vault: vaultC } = await requireSigner();
        setTxStep("confirming");
        const tx = await vaultC.withdrawLiquidity(usdToUnits(amount));
        const receipt = await tx.wait();
        await refresh();
        return receipt.hash;
      } catch (err) {
        setChainError(friendlyChainError(err, "Principal withdrawal failed."));
        return null;
      } finally {
        setTxStep(null);
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
      protocolStats,
      wallet,
      isSentry,
      liveMode,
      configured: liveMode,
      loading,
      chainError,
      txStep,
      clearChainError,
      connect,
      disconnect,
      refresh,
      tokenizeInvoice,
      awaitUnderwriting,
      underwriteAsSentry,
      startStream,
      settleInvoice,
      depositLiquidity,
      withdrawLiquidity,
      withdrawYield,
    }),
    [
      invoices,
      vault,
      auditLog,
      sentries,
      protocolStats,
      wallet,
      isSentry,
      liveMode,
      loading,
      chainError,
      txStep,
      clearChainError,
      connect,
      disconnect,
      refresh,
      tokenizeInvoice,
      awaitUnderwriting,
      underwriteAsSentry,
      startStream,
      settleInvoice,
      depositLiquidity,
      withdrawLiquidity,
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
