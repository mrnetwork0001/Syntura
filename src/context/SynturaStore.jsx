import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  SEED_INVOICES,
  SEED_VAULT,
  SEED_AUDIT_LOG,
} from "../lib/mockData.js";
import { pseudoTxHash, clamp } from "../lib/utils.js";
import { connectWallet, isLiveChainConfigured } from "../lib/chain.js";

const SynturaContext = createContext(null);

/**
 * Global protocol state. Runs in "demo" mode (simulated chain writes with
 * realistic latency) until contract addresses are configured in .env, at
 * which point the same actions can be routed through src/lib/chain.js.
 *
 * Store API (stable — consumed by every page):
 *   invoices, vault, auditLog, wallet, liveMode
 *   connect(), tokenizeInvoice(payload, underwriting), startStream(id),
 *   settleInvoice(id), depositLiquidity(amountUSD), withdrawYield()
 */
export function SynturaProvider({ children }) {
  const [invoices, setInvoices] = useState(SEED_INVOICES);
  const [vault, setVault] = useState(SEED_VAULT);
  const [auditLog, setAuditLog] = useState(SEED_AUDIT_LOG);
  const [wallet, setWallet] = useState({ address: null, connecting: false });

  const liveMode = isLiveChainConfigured();

  const pushEvent = useCallback((type, label, detail, txHash) => {
    setAuditLog((log) => [
      {
        id: `evt-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        ts: new Date().toISOString(),
        type,
        label,
        detail,
        txHash: txHash || pseudoTxHash(label),
      },
      ...log,
    ]);
  }, []);

  const connect = useCallback(async () => {
    setWallet((w) => ({ ...w, connecting: true }));
    try {
      const res = await connectWallet();
      if (res) {
        setWallet({ address: res.address, connecting: false });
        return res.address;
      }
      // No injected wallet — demo identity so every flow stays clickable.
      const demo = "0x71C2aF4d8E9b3056Bb1D2c3E4F5a6B7c8D9E9E4d";
      setWallet({ address: demo, connecting: false });
      return demo;
    } catch {
      setWallet({ address: null, connecting: false });
      return null;
    }
  }, []);

  /** Simulated chain latency for demo mode. */
  const simulateTx = useCallback(
    (label) =>
      new Promise((resolve) =>
        setTimeout(() => resolve(pseudoTxHash(label)), 900 + Math.random() * 900)
      ),
    []
  );

  /**
   * Mint an invoice NFT with AI underwriting attached.
   * payload: { supplierName, debtorName, faceValueUSD, dueDate, termDays, sector }
   * underwriting: result of underwriteInvoice() from the AI Sentry agent.
   */
  const tokenizeInvoice = useCallback(
    async (payload, underwriting) => {
      const txHash = await simulateTx(`mint-${payload.debtorName}`);
      const id = Math.max(0, ...invoices.map((i) => i.id)) + 1;
      const invoice = {
        id,
        supplier: wallet.address || "0x71C2aF4d8E9b3056Bb1D2c3E4F5a6B7c8D9E9E4d",
        supplierName: payload.supplierName || "Your Business",
        debtorName: payload.debtorName,
        faceValueUSD: Number(payload.faceValueUSD),
        dueDate: payload.dueDate,
        termDays: Number(payload.termDays),
        sector: payload.sector || "Other",
        riskScore: underwriting.riskScore,
        fraudProbability: underwriting.fraudProbability,
        discountRateBps: underwriting.discountRateBps,
        status: "Underwritten",
        streamedPct: 0,
        txHash,
        mintedAt: new Date().toISOString().slice(0, 10),
      };
      setInvoices((list) => [invoice, ...list]);
      pushEvent(
        "MINT",
        `Invoice #${id} tokenized as RWA NFT on BOTChain`,
        `${payload.debtorName} · $${Number(payload.faceValueUSD).toLocaleString()}`,
        txHash
      );
      pushEvent(
        "AI_UNDERWRITE",
        `AI Sentry underwrote Invoice #${id} — risk ${underwriting.riskScore}/100 @ ${(underwriting.discountRateBps / 100).toFixed(2)}%`,
        `Fraud probability ${underwriting.fraudProbability}% · Audit hash committed on-chain`
      );
      return invoice;
    },
    [invoices, wallet.address, pushEvent, simulateTx]
  );

  /** Move an underwritten invoice into real-time streaming. */
  const startStream = useCallback(
    async (id) => {
      const inv = invoices.find((i) => i.id === id);
      if (!inv || inv.status !== "Underwritten") return null;
      const txHash = await simulateTx(`stream-${id}`);
      setInvoices((list) =>
        list.map((i) =>
          i.id === id ? { ...i, status: "Streaming", streamedPct: 5, txHash } : i
        )
      );
      setVault((v) => ({
        ...v,
        activeStreamsUSD: v.activeStreamsUSD + inv.faceValueUSD * 0.05,
        poolUtilizationPct: clamp(v.poolUtilizationPct + 1.2, 0, 100),
      }));
      pushEvent(
        "STREAM",
        `Streaming started for Invoice #${id} — $${inv.faceValueUSD.toLocaleString()} face value`,
        `Real-time payout to ${inv.supplierName}`,
        txHash
      );
      return txHash;
    },
    [invoices, pushEvent, simulateTx]
  );

  /** Settle a streaming invoice: 90% supplier / 7% pool / 3% treasury. */
  const settleInvoice = useCallback(
    async (id) => {
      const inv = invoices.find((i) => i.id === id);
      if (!inv || inv.status === "Settled") return null;
      const txHash = await simulateTx(`settle-${id}`);
      const supplierCut = inv.faceValueUSD * 0.9;
      const poolCut = inv.faceValueUSD * 0.07;
      const treasuryCut = inv.faceValueUSD * 0.03;
      setInvoices((list) =>
        list.map((i) =>
          i.id === id ? { ...i, status: "Settled", streamedPct: 100, txHash } : i
        )
      );
      setVault((v) => ({
        ...v,
        totalLiquidityUSD: v.totalLiquidityUSD + poolCut,
        activeStreamsUSD: Math.max(0, v.activeStreamsUSD - inv.faceValueUSD * 0.05),
        yourYieldUSD:
          v.yourDepositUSD > 0
            ? v.yourYieldUSD + poolCut * (v.yourDepositUSD / v.totalLiquidityUSD)
            : v.yourYieldUSD,
      }));
      pushEvent(
        "SETTLEMENT",
        `Invoice #${id} settled — 90/7/3 fee split executed`,
        `Supplier $${supplierCut.toLocaleString()} · Pool $${poolCut.toLocaleString()} · Treasury $${treasuryCut.toLocaleString()}`,
        txHash
      );
      return txHash;
    },
    [invoices, pushEvent, simulateTx]
  );

  /** Deposit streaming liquidity into the vault. */
  const depositLiquidity = useCallback(
    async (amountUSD) => {
      const amount = Number(amountUSD);
      if (!amount || amount <= 0) return null;
      const txHash = await simulateTx(`deposit-${amount}`);
      setVault((v) => ({
        ...v,
        totalLiquidityUSD: v.totalLiquidityUSD + amount,
        yourDepositUSD: v.yourDepositUSD + amount,
        providers: v.yourDepositUSD === 0 ? v.providers + 1 : v.providers,
      }));
      pushEvent(
        "DEPOSIT",
        `Liquidity deposit — $${amount.toLocaleString()} into streaming vault`,
        `Provider ${wallet.address ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}` : "demo"} · Earning ${SEED_VAULT.averageYieldAPY}% APY`,
        txHash
      );
      return txHash;
    },
    [pushEvent, simulateTx, wallet.address]
  );

  /** Withdraw accrued yield. */
  const withdrawYield = useCallback(async () => {
    if (vault.yourYieldUSD <= 0) return null;
    const txHash = await simulateTx("withdraw-yield");
    const amount = vault.yourYieldUSD;
    setVault((v) => ({ ...v, yourYieldUSD: 0 }));
    pushEvent(
      "WITHDRAW",
      `Yield withdrawn — $${amount.toFixed(2)} paid out`,
      "Automated pro-rata distribution from settlement fees",
      txHash
    );
    return txHash;
  }, [vault.yourYieldUSD, pushEvent, simulateTx]);

  const value = useMemo(
    () => ({
      invoices,
      vault,
      auditLog,
      wallet,
      liveMode,
      connect,
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
      wallet,
      liveMode,
      connect,
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
