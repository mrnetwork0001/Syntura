import React, { useMemo, useState } from "react";
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
  CheckCircle2,
  Loader2,
  Coins,
  Gauge,
  Split,
  Sparkles,
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

const QUICK_PICKS = [1000, 10000, 50000];

const YIELD_STEPS = [
  {
    icon: PiggyBank,
    title: "Deposit liquidity",
    body: "Your capital enters the Syntura streaming vault and joins the shared pool backing tokenized RWA invoices.",
    tile: "border-electric/30 bg-electric/10 text-electric-soft",
  },
  {
    icon: Waves,
    title: "Vault streams advances",
    body: "AI-underwritten invoices draw real-time payouts - the pool advances face value to suppliers block by block.",
    tile: "border-violetx/30 bg-violetx/10 text-violetx-soft",
  },
  {
    icon: Coins,
    title: "Settlement yield flows back",
    body: "When the debtor pays, 7% of every settlement routes pro-rata to providers - withdraw any time.",
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

export default function LiquidityVaults() {
  const { vault, depositLiquidity, withdrawYield } = useSyntura();

  const [amountInput, setAmountInput] = useState("");
  const [depositing, setDepositing] = useState(false);
  const [depositTx, setDepositTx] = useState(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawTx, setWithdrawTx] = useState(null);
  const [lastWithdrawnUSD, setLastWithdrawnUSD] = useState(0);

  const amount = Number(amountInput);
  const amountValid = Number.isFinite(amount) && amount > 0;
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
    if (!amountValid || depositing) return;
    setDepositing(true);
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
        subtitle="Provide streaming liquidity to AI-underwritten RWA invoices and earn real-time settlement yield."
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
          label="Total Liquidity"
          value={formatUSD(vault.totalLiquidityUSD)}
          accent="electric"
          index={0}
        />
        <StatCard
          icon={Waves}
          label="Active Streams"
          value={formatUSD(vault.activeStreamsUSD)}
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
                  Capital is deployed into real-time invoice payout streams.
                </p>
              </div>
            </div>

            <label className="label-glass" htmlFor="vault-deposit-amount">
              Deposit amount (USD)
            </label>
            <input
              id="vault-deposit-amount"
              type="number"
              min="1"
              step="100"
              inputMode="decimal"
              placeholder="e.g. 25,000"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              disabled={depositing}
              className="input-glass mt-1.5 w-full font-mono text-lg"
            />

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
              disabled={!amountValid || depositing}
              className={cn(
                "btn-primary mt-5 w-full",
                (!amountValid || depositing) && "cursor-not-allowed opacity-50"
              )}
            >
              {depositing ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={16} className="animate-spin" />
                  Depositing on BOTChain…
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <Landmark size={16} />
                  Deposit {amountValid ? formatUSD(amount) : "Liquidity"}
                </span>
              )}
            </button>

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
                <p className="text-xs text-slate-400">Deposit, yield and pool share.</p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="glass-inset flex items-center justify-between rounded-xl px-4 py-3">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Deposited
                </span>
                <span className="font-mono text-sm font-bold text-white">
                  {formatUSD(vault.yourDepositUSD)}
                </span>
              </div>
              <div className="glass-inset flex items-center justify-between rounded-xl px-4 py-3">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Accrued yield
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
                    {formatUSD(lastWithdrawnUSD, { decimals: 2 })} paid out
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
                  Deployed in streams
                </p>
                <p className="mt-1 font-mono text-sm font-bold text-violetx-soft">
                  {formatUSD(deployedUSD)}
                </p>
              </div>
              <div className="glass-inset rounded-xl px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  Idle liquidity
                </p>
                <p className="mt-1 font-mono text-sm font-bold text-slate-300">
                  {formatUSD(idleUSD)}
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
