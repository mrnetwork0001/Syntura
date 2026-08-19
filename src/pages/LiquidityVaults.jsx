import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Landmark,
  Waves,
  TrendingUp,
  Users,
  PiggyBank,
  ArrowDownToLine,
  ArrowRight,
  ArrowDown,
  ArrowUpRight,
  CheckCircle2,
  Loader2,
  Coins,
  Gauge,
  Split,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useSyntura } from "../context/SynturaStore.jsx";
import {
  GlassCard,
  StatCard,
  SectionTitle,
  TxLink,
  ProgressBar,
} from "../components/ui/Glass.jsx";
import { cn, formatUSD, formatPercent } from "../lib/utils.js";

// Real money now moves: deposits are bridged USDT, so the picks are the
// amounts a provider can actually try on mainnet.
const QUICK_PICKS = [1, 5, 25];

/** Where a wallet with no USDT can get some. Plain link, nothing embedded. */
const USDT_DEX_URL = "https://dex.botchain.ai/";

const YIELD_STEPS = [
  {
    icon: PiggyBank,
    title: "Approve, then deposit",
    body: "You approve the exact USDT amount, the vault pulls it into the shared pool backing tokenized RWA invoices.",
    tile: "border-electric/30 bg-electric/10 text-electric-soft",
  },
  {
    icon: Waves,
    title: "Vault streams advances",
    body: "The moment an invoice clears underwriting, the pool advances most of its face value to the supplier in a single onchain payout.",
    tile: "border-violetx/30 bg-violetx/10 text-violetx-soft",
  },
  {
    icon: Coins,
    title: "Settlement yield flows back",
    body: "When the debtor settles in USDT, 7% of every settlement routes pro-rata to providers - withdraw any time.",
    tile: "border-emeraldx/30 bg-emeraldx/10 text-emeraldx-soft",
  },
];

const FEE_SEGMENTS = [
  {
    key: "supplierPct",
    label: "Supplier payout",
    note: "Advance streamed to the invoice supplier on settlement.",
    bar: "bg-gradient-to-r from-emeraldx to-emeraldx-soft",
    dot: "bg-emeraldx-soft",
    text: "text-emeraldx-soft",
  },
  {
    key: "poolPct",
    label: "Liquidity pool",
    note: "Yield distributed pro-rata to vault providers like you.",
    bar: "bg-gradient-to-r from-electric-deep to-electric-soft",
    dot: "bg-electric-soft",
    text: "text-electric-soft",
  },
  {
    key: "treasuryPct",
    label: "Protocol treasury",
    note: "Funds sentry operations, audits and protocol growth.",
    bar: "bg-gradient-to-r from-violetx to-violetx-soft",
    dot: "bg-violetx-soft",
    text: "text-violetx-soft",
  },
];

/**
 * The deposit is an ERC-20 flow, so it is two transactions worth of waiting:
 * an exact-amount approval (skipped when the standing allowance already covers
 * it) and then the deposit itself. `txStep` from the store drives both rows.
 */
function DepositSteps({ txStep, approvalSeen }) {
  const approveState =
    txStep === "approving"
      ? "active"
      : txStep === "depositing" || txStep === "confirming"
        ? "done"
        : "pending";
  const depositState =
    txStep === "depositing" || txStep === "confirming" ? "active" : "pending";

  const rows = [
    {
      key: "approve",
      label: "Approving USDT",
      state: approveState,
      note:
        approveState === "done" && !approvalSeen
          ? "not needed - allowance already covers this deposit"
          : "exact amount only, never an unlimited allowance",
    },
    {
      key: "deposit",
      label: "Depositing into the vault",
      state: depositState,
      note:
        txStep === "confirming"
          ? "waiting for the BOTChain receipt…"
          : "transfers the USDT and credits your position",
    },
  ];

  return (
    <div className="glass-inset mt-4 space-y-2.5 rounded-xl p-4">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {txStep === "checking"
          ? "Checking USDT balance & allowance"
          : "Two-step deposit"}
      </p>
      {rows.map((row) => (
        <div key={row.key} className="flex items-start gap-3 font-mono text-xs">
          {row.state === "done" ? (
            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emeraldx-soft" />
          ) : row.state === "active" ? (
            <Loader2 size={14} className="mt-0.5 shrink-0 animate-spin text-electric-soft" />
          ) : (
            <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border border-slate-700" />
          )}
          <div className="min-w-0">
            <p
              className={cn(
                row.state === "active"
                  ? "text-white"
                  : row.state === "done"
                    ? "text-slate-300"
                    : "text-slate-500"
              )}
            >
              {row.label}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500">{row.note}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LiquidityVaults() {
  const { vault, wallet, txStep, depositLiquidity, withdrawYield } = useSyntura();

  const [amountInput, setAmountInput] = useState("");
  const [depositing, setDepositing] = useState(false);
  // True once this deposit actually prompted an approval, so the step list can
  // say "not needed" instead of implying a signature that never happened.
  const [approvalSeen, setApprovalSeen] = useState(false);
  const [depositTx, setDepositTx] = useState(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawTx, setWithdrawTx] = useState(null);
  const [lastWithdrawnUSD, setLastWithdrawnUSD] = useState(0);

  useEffect(() => {
    if (txStep === "approving") setApprovalSeen(true);
  }, [txStep]);

  const amount = Number(amountInput);
  const amountValid = Number.isFinite(amount) && amount > 0;
  const balanceUSDT = wallet.balanceUSDT;
  const balanceKnown = typeof balanceUSDT === "number";
  const overBalance = balanceKnown && amountValid && amount > balanceUSDT;
  const canDeposit = amountValid && !overBalance && !depositing;
  const apy = vault.averageYieldAPY;

  const projection = useMemo(() => {
    if (!amountValid) return null;
    const annual = (amount * apy) / 100;
    return {
      daily: annual / 365,
      monthly: annual / 12,
      annual,
      poolSharePct: (amount / (vault.totalLiquidityUSD + amount)) * 100,
    };
  }, [amount, amountValid, apy, vault.totalLiquidityUSD]);

  const yourSharePct =
    vault.yourDepositUSD > 0
      ? (vault.yourDepositUSD / vault.totalLiquidityUSD) * 100
      : 0;

  const deployedUSD = vault.totalLiquidityUSD * (vault.poolUtilizationPct / 100);
  const idleUSD = vault.totalLiquidityUSD - deployedUSD;

  const handleDeposit = async () => {
    if (!canDeposit) return;
    setDepositing(true);
    setApprovalSeen(false);
    setDepositTx(null);
    try {
      const tx = await depositLiquidity(amount);
      if (tx) {
        setDepositTx(tx);
        setAmountInput("");
      }
    } finally {
      setDepositing(false);
    }
  };

  const handleWithdraw = async () => {
    if (vault.yourYieldUSD <= 0 || withdrawing) return;
    const pending = vault.yourYieldUSD;
    setWithdrawing(true);
    setWithdrawTx(null);
    try {
      const tx = await withdrawYield();
      if (tx) {
        setWithdrawTx(tx);
        setLastWithdrawnUSD(pending);
      }
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="space-y-8"
    >
      <SectionTitle
        title="Liquidity Vaults"
        subtitle="Provide streaming liquidity in bridged USDT to AI-underwritten RWA invoices and earn real-time settlement yield."
        action={
          <span className="inline-flex items-center gap-2 rounded-full border border-emeraldx/30 bg-emeraldx/10 px-3 py-1 text-xs font-semibold text-emeraldx-soft">
            <Sparkles size={13} />
            {formatPercent(apy)} lifetime pool return
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Landmark}
          label="Total Liquidity · USDT"
          value={formatUSD(vault.totalLiquidityUSD, { decimals: 2 })}
          accent="electric"
          index={0}
        />
        <StatCard
          icon={Waves}
          label="Active Streams · USDT"
          value={formatUSD(vault.activeStreamsUSD, { decimals: 2 })}
          accent="violet"
          index={1}
        />
        <StatCard
          icon={TrendingUp}
          label="Pool Return · Lifetime"
          value={formatPercent(apy)}
          accent="emerald"
          index={2}
        />
        <StatCard
          icon={Users}
          label="Liquidity Providers"
          value={vault.providers.toLocaleString()}
          accent="amber"
          index={3}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Deposit flow */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="lg:col-span-2"
        >
          <GlassCard className="h-full">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-electric/30 bg-electric/10 text-electric-soft">
                <PiggyBank size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Deposit Streaming Liquidity
                </h3>
                <p className="text-xs text-slate-400">
                  Bridged USDT is deployed into real-time invoice payout streams.
                </p>
              </div>
            </div>

            <label className="label-glass" htmlFor="vault-deposit-amount">
              Deposit amount (USDT)
            </label>
            <input
              id="vault-deposit-amount"
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              placeholder="e.g. 5"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              disabled={depositing}
              className="input-glass mt-1.5 w-full font-mono text-lg"
            />

            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <p className="font-mono text-[11px] text-slate-500">
                <Wallet size={11} className="mr-1.5 inline align-[-1px]" />
                {wallet.address ? (
                  <>
                    Wallet balance{" "}
                    <span className="font-semibold text-slate-300">
                      {balanceKnown ? formatUSD(balanceUSDT, { decimals: 2 }) : "…"}
                    </span>{" "}
                    USDT
                  </>
                ) : (
                  "Connect a wallet to see your USDT balance"
                )}
                {balanceKnown && balanceUSDT > 0 && (
                  <button
                    type="button"
                    onClick={() => setAmountInput(String(balanceUSDT))}
                    disabled={depositing}
                    className="ml-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-electric-soft transition-colors hover:text-white disabled:opacity-50"
                  >
                    Max
                  </button>
                )}
              </p>
              <a
                href={USDT_DEX_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:text-electric-soft"
              >
                Need USDT? <ArrowUpRight size={11} />
              </a>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_PICKS.map((v) => (
                <button
                  key={v}
                  type="button"
                  disabled={depositing}
                  onClick={() => setAmountInput(String(v))}
                  className={cn(
                    "rounded-full border px-4 py-1.5 text-xs font-semibold transition-all",
                    amount === v
                      ? "border-electric/60 bg-electric/20 text-white shadow-glow-blue"
                      : "border-slate-700/70 bg-panel/40 text-slate-300 hover:border-electric/40 hover:text-white"
                  )}
                >
                  {formatUSD(v, { compact: true })}
                </button>
              ))}
            </div>

            {/* Projected yield */}
            <div className="glass-inset mt-5 rounded-xl p-4">
              <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <TrendingUp size={14} className="text-emeraldx-soft" />
                Projected at {formatPercent(apy)} lifetime pool return
              </p>
              {projection ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <p className="font-mono text-sm font-bold text-white">
                      {formatUSD(projection.daily, { decimals: 2 })}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">per day</p>
                  </div>
                  <div>
                    <p className="font-mono text-sm font-bold text-white">
                      {formatUSD(projection.monthly, { decimals: 2 })}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">per month</p>
                  </div>
                  <div>
                    <p className="font-mono text-sm font-bold text-emeraldx-soft">
                      {formatUSD(projection.annual, { decimals: 2 })}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">per year</p>
                  </div>
                  <div>
                    <p className="font-mono text-sm font-bold text-electric-soft">
                      {formatPercent(projection.poolSharePct, 3)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">pool share</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  Enter an amount to preview daily, monthly and annual yield.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleDeposit}
              disabled={!canDeposit}
              className={cn(
                "btn-primary mt-5 w-full",
                !canDeposit && "cursor-not-allowed opacity-50"
              )}
            >
              {depositing ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  {txStep === "approving"
                    ? "Approving USDT…"
                    : txStep === "confirming"
                      ? "Confirming on BOTChain…"
                      : txStep === "depositing"
                        ? "Depositing on BOTChain…"
                        : "Checking USDT balance…"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Landmark size={16} />
                  Deposit{" "}
                  {amountValid
                    ? `${formatUSD(amount, { decimals: 2 })} USDT`
                    : "Liquidity"}
                </span>
              )}
            </button>

            {overBalance && !depositing && (
              <p className="mt-2 text-center text-[11px] text-rose-400">
                Wallet holds {formatUSD(balanceUSDT, { decimals: 2 })} USDT - lower
                the amount or top up before depositing.
              </p>
            )}

            {depositing && (
              <DepositSteps txStep={txStep} approvalSeen={approvalSeen} />
            )}

            {depositTx && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emeraldx/30 bg-emeraldx/10 px-4 py-3"
              >
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-emeraldx-soft">
                  <CheckCircle2 size={16} />
                  Deposit confirmed - now earning streaming yield
                </span>
                <TxLink hash={depositTx} />
              </motion.div>
            )}
          </GlassCard>
        </motion.div>

        {/* Your position */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.4 }}
        >
          <GlassCard className="flex h-full flex-col">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emeraldx/30 bg-emeraldx/10 text-emeraldx-soft">
                <Coins size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Your Position</h3>
                <p className="text-xs text-slate-400">
                  Deposit, yield and pool share - all in USDT.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="glass-inset flex items-center justify-between rounded-xl px-4 py-3">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Deposited · USDT
                </span>
                <span className="font-mono text-sm font-bold text-white">
                  {formatUSD(vault.yourDepositUSD, { decimals: 2 })}
                </span>
              </div>
              <div className="glass-inset flex items-center justify-between rounded-xl px-4 py-3">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Accrued yield · USDT
                </span>
                <span
                  className={cn(
                    "font-mono text-sm font-bold",
                    vault.yourYieldUSD > 0 ? "text-emeraldx-soft" : "text-slate-500"
                  )}
                >
                  {formatUSD(vault.yourYieldUSD, { decimals: 2 })}
                </span>
              </div>
              <div className="glass-inset flex items-center justify-between rounded-xl px-4 py-3">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Pool share
                </span>
                <span className="font-mono text-sm font-bold text-electric-soft">
                  {yourSharePct > 0 ? formatPercent(yourSharePct, 3) : "-"}
                </span>
              </div>
            </div>

            <div className="mt-auto pt-5">
              <button
                type="button"
                onClick={handleWithdraw}
                disabled={vault.yourYieldUSD <= 0 || withdrawing}
                className={cn(
                  "btn-ghost w-full",
                  (vault.yourYieldUSD <= 0 || withdrawing) &&
                    "cursor-not-allowed opacity-50"
                )}
              >
                {withdrawing ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    Withdrawing yield…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <ArrowDownToLine size={16} />
                    Withdraw Yield
                  </span>
                )}
              </button>
              {vault.yourYieldUSD <= 0 && !withdrawTx && (
                <p className="mt-2 text-center text-[11px] text-slate-500">
                  Yield accrues automatically as invoices settle.
                </p>
              )}
              {withdrawTx && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emeraldx/30 bg-emeraldx/10 px-3 py-2.5"
                >
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emeraldx-soft">
                    <CheckCircle2 size={14} />
                    {formatUSD(lastWithdrawnUSD, { decimals: 2 })} USDT paid out
                  </span>
                  <TxLink hash={withdrawTx} />
                </motion.div>
              )}
            </div>
          </GlassCard>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pool utilization */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.4 }}
        >
          <GlassCard className="h-full">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violetx/30 bg-violetx/10 text-violetx-soft">
                  <Gauge size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Pool Utilization</h3>
                  <p className="text-xs text-slate-400">
                    Share of vault capital deployed in live streams.
                  </p>
                </div>
              </div>
              <span className="font-mono text-2xl font-extrabold text-white">
                {formatPercent(vault.poolUtilizationPct, 1)}
              </span>
            </div>
            <ProgressBar value={vault.poolUtilizationPct} accent="violet" className="h-2.5" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="glass-inset rounded-xl px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Deployed in streams · USDT
                </p>
                <p className="mt-1 font-mono text-sm font-bold text-violetx-soft">
                  {formatUSD(deployedUSD, { decimals: 2 })}
                </p>
              </div>
              <div className="glass-inset rounded-xl px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Idle liquidity · USDT
                </p>
                <p className="mt-1 font-mono text-sm font-bold text-slate-300">
                  {formatUSD(idleUSD, { decimals: 2 })}
                </p>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* 90/7/3 fee-split explainer */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <GlassCard className="h-full">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emeraldx/30 bg-emeraldx/10 text-emeraldx-soft">
                <Split size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  90 / 7 / 3 Settlement Split
                </h3>
                <p className="text-xs text-slate-400">
                  Every settled invoice is split atomically onchain.
                </p>
              </div>
            </div>

            <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-slate-800">
              {FEE_SEGMENTS.map((seg, i) => (
                <motion.div
                  key={seg.key}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.35 + i * 0.12, duration: 0.6, ease: "easeOut" }}
                  style={{ width: `${vault.feeSplit[seg.key]}%`, transformOrigin: "left" }}
                  className={seg.bar}
                />
              ))}
            </div>

            <div className="mt-4 space-y-3">
              {FEE_SEGMENTS.map((seg) => (
                <div key={seg.key} className="flex items-start gap-3">
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", seg.dot)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">
                      {seg.label}
                      <span className={cn("ml-2 font-mono text-xs font-bold", seg.text)}>
                        {vault.feeSplit[seg.key]}%
                      </span>
                    </p>
                    <p className="text-xs text-slate-400">{seg.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </motion.div>
      </div>

      {/* How streaming yield works */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.36, duration: 0.4 }}
      >
        <GlassCard>
          <SectionTitle
            title="How Streaming Yield Works"
            subtitle="From deposit to real-time settlement yield in three onchain steps."
            className="mb-6"
          />
          <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-center">
            {YIELD_STEPS.map((step, i) => (
              <React.Fragment key={step.title}>
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.42 + i * 0.12, duration: 0.4 }}
                  className="glass-inset relative flex-1 rounded-2xl p-5"
                >
                  <span className="absolute right-4 top-4 font-mono text-[11px] font-bold text-slate-600">
                    0{i + 1}
                  </span>
                  <div
                    className={cn(
                      "mb-3 flex h-11 w-11 items-center justify-center rounded-xl border",
                      step.tile
                    )}
                  >
                    <step.icon size={20} />
                  </div>
                  <p className="text-sm font-bold text-white">{step.title}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    {step.body}
                  </p>
                </motion.div>
                {i < YIELD_STEPS.length - 1 && (
                  <div className="flex shrink-0 items-center justify-center text-slate-600">
                    <ArrowRight size={18} className="hidden md:block" />
                    <ArrowDown size={18} className="md:hidden" />
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </GlassCard>
      </motion.div>
    </motion.div>
  );
}
