import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  BrainCircuit,
  CalendarClock,
  CircleDollarSign,
  Cpu,
  ExternalLink,
  Fingerprint,
  Minus,
  Network,
  Percent,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  TrendingUp,
  Zap,
} from "lucide-react";
import { GlassCard, Badge, ProgressBar, RiskGauge, TxLink } from "../components/ui/Glass.jsx";
import { useSyntura } from "../context/SynturaStore.jsx";
import { underwriteInvoice, classifyRisk, SENTRY_MODEL_ID } from "../agent/aiSentryAgent.js";
import { SECTORS } from "../lib/mockData.js";
import { cn, formatUSD, formatPercent, bpsToPercent, shortAddress, formatDate } from "../lib/utils.js";
import { CONTRACTS, explorerAddressUrl } from "../lib/chain.js";

/** Demo identity of the registered on-chain sentry (deploy script registers the deployer). */
const SENTRY_AGENT_ADDRESS = "0x5E27aB9c41D3f80E6B2a9C7d4e1F0b8A3c6d5E42";

const PRESETS = [
  {
    name: "Blue-chip debtor",
    values: {
      debtorName: "Dangote Industries PLC",
      supplierName: "Lagos Logistics Co.",
      sector: "Logistics & Freight",
      faceValueUSD: 125000,
      termDays: 45,
      debtorYearsTrading: 24,
      priorInvoicesPaid: 38,
      priorInvoicesDefaulted: 0,
    },
  },
  {
    name: "Growing SME",
    values: {
      debtorName: "Acme Retail Ltd",
      supplierName: "Nairobi DevWorks",
      sector: "Retail & E-Commerce",
      faceValueUSD: 48500,
      termDays: 30,
      debtorYearsTrading: 6,
      priorInvoicesPaid: 12,
      priorInvoicesDefaulted: 1,
    },
  },
  {
    name: "First-time debtor",
    values: {
      debtorName: "NovaTech Ventures",
      supplierName: "Kigali Creative Studio",
      sector: "Software Services",
      faceValueUSD: 86200,
      termDays: 60,
      debtorYearsTrading: 2,
      priorInvoicesPaid: 0,
      priorInvoicesDefaulted: 0,
    },
  },
  {
    name: "Fraud signals",
    values: {
      debtorName: "Quick Cash Trading",
      supplierName: "Meridian Exports",
      sector: "Other",
      faceValueUSD: 500000,
      termDays: 118,
      debtorYearsTrading: 1,
      priorInvoicesPaid: 0,
      priorInvoicesDefaulted: 2,
    },
  },
];

const IMPACT_STYLES = {
  positive: {
    icon: ArrowUpRight,
    text: "text-emeraldx-soft",
    chip: "border-emeraldx/40 bg-emeraldx/10 text-emeraldx-soft",
    bar: "emerald",
  },
  negative: {
    icon: ArrowDownRight,
    text: "text-rose-400",
    chip: "border-rose-500/40 bg-rose-500/10 text-rose-300",
    bar: "violet",
  },
  neutral: {
    icon: Minus,
    text: "text-slate-400",
    chip: "border-slate-600/50 bg-slate-500/10 text-slate-300",
    bar: "electric",
  },
};

function SliderField({ label, value, min, max, step = 1, onChange, display, minLabel, maxLabel }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
        <span className="font-mono text-sm font-bold text-white">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full cursor-pointer"
        style={{ accentColor: "#60a5fa" }}
      />
      <div className="mt-1 flex justify-between text-[10px] font-medium text-slate-500">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }) {
  const btn =
    "flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700/70 bg-panel/50 text-slate-300 transition-colors hover:border-electric/50 hover:text-white disabled:opacity-30 disabled:pointer-events-none";
  return (
    <div className="glass-inset px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="mt-1.5 flex items-center justify-between">
        <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Decrease ${label}`}>
          <Minus size={13} />
        </button>
        <span className="font-mono text-base font-bold text-white">{value}</span>
        <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`Increase ${label}`}>
          <Plus size={13} />
        </button>
      </div>
    </div>
  );
}

function MetricTile({ icon: Icon, label, value, tone = "text-white", sub }) {
  return (
    <div className="glass-inset px-4 py-3.5">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon size={13} />
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className={cn("mt-1.5 font-mono text-xl font-bold", tone)}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>}
    </div>
  );
}

function SentryStatusChip({ tone, icon: Icon, children }) {
  const tones = {
    verified: "border-emeraldx/40 bg-emeraldx/15 text-emeraldx-soft",
    staging: "border-amber-500/40 bg-amber-500/15 text-amber-300",
    open: "border-slate-600/50 bg-slate-500/10 text-slate-400",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", tones[tone])}>
      <Icon size={12} />
      {children}
    </span>
  );
}

export default function RiskUnderwriter() {
  const { invoices, liveMode } = useSyntura();
  const [form, setForm] = useState(PRESETS[0].values);
  const [activePreset, setActivePreset] = useState(PRESETS[0].name);

  const setField = (key, value) => {
    setActivePreset(null);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const applyPreset = (preset) => {
    setForm(preset.values);
    setActivePreset(preset.name);
  };

  const dueDate = useMemo(
    () => new Date(Date.now() + form.termDays * 86_400_000).toISOString().slice(0, 10),
    [form.termDays]
  );

  // Live sandbox core: every keystroke/slider tick re-runs the deterministic model.
  const result = useMemo(
    () =>
      underwriteInvoice({
        debtorName: form.debtorName.trim() || "Unnamed Debtor",
        supplierName: form.supplierName.trim() || "Unnamed Supplier",
        faceValueUSD: form.faceValueUSD,
        termDays: form.termDays,
        dueDate,
        sector: form.sector,
        debtorYearsTrading: form.debtorYearsTrading,
        priorInvoicesPaid: form.priorInvoicesPaid,
        priorInvoicesDefaulted: form.priorInvoicesDefaulted,
      }),
    [form, dueDate]
  );

  const tier = classifyRisk(result.riskScore);
  const advanceUSD = (form.faceValueUSD * result.advanceRatePct) / 100;
  const discountFeeUSD = (form.faceValueUSD * result.discountRateBps) / 10_000;
  const commitments = invoices.filter((i) => i.riskScore > 0).length;
  const fraudTone =
    result.fraudProbability < 5 ? "text-emeraldx-soft" : result.fraudProbability < 15 ? "text-amber-300" : "text-rose-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-electric/30 bg-gradient-to-br from-electric/20 to-violetx/20 text-electric-soft shadow-glow-blue">
            <BrainCircuit size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">
              AI Risk Sentry <span className="text-gradient">Sandbox</span>
            </h1>
            <p className="mt-0.5 text-sm text-slate-400">
              Adjust any input — the sentry re-underwrites instantly. No submit button, no black box.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-emeraldx/40 bg-emeraldx/10 px-3 py-1 text-xs font-semibold text-emeraldx-soft">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emeraldx-soft" />
            Live re-underwriting
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/70 bg-panel/40 px-3 py-1 font-mono text-xs text-slate-300">
            <Cpu size={12} className="text-violetx-soft" />
            {SENTRY_MODEL_ID}
          </span>
        </div>
      </div>

      {/* Sandbox: inputs + verdict */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Inputs */}
        <GlassCard className="lg:col-span-2">
          <div className="mb-5 flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-electric-soft" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">Simulation Inputs</h2>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => applyPreset(p)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold transition-all duration-200",
                  activePreset === p.name
                    ? "border-electric/60 bg-electric/15 text-electric-soft shadow-glow-blue"
                    : "border-slate-700/70 bg-panel/40 text-slate-400 hover:border-electric/40 hover:text-slate-200"
                )}
              >
                {p.name}
              </button>
            ))}
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label-glass" htmlFor="ru-debtor">Debtor</label>
                <input
                  id="ru-debtor"
                  className="input-glass"
                  value={form.debtorName}
                  onChange={(e) => setField("debtorName", e.target.value)}
                  placeholder="e.g. Safaricom PLC"
                />
              </div>
              <div>
                <label className="label-glass" htmlFor="ru-supplier">Supplier</label>
                <input
                  id="ru-supplier"
                  className="input-glass"
                  value={form.supplierName}
                  onChange={(e) => setField("supplierName", e.target.value)}
                  placeholder="Your business"
                />
              </div>
            </div>

            <div>
              <label className="label-glass" htmlFor="ru-sector">Sector</label>
              <select
                id="ru-sector"
                className="input-glass cursor-pointer"
                value={form.sector}
                onChange={(e) => setField("sector", e.target.value)}
              >
                {SECTORS.map((s) => (
                  <option key={s} value={s} className="bg-abyss">
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <SliderField
              label="Invoice Face Value"
              value={form.faceValueUSD}
              min={5000}
              max={500000}
              step={100}
              onChange={(v) => setField("faceValueUSD", v)}
              display={formatUSD(form.faceValueUSD)}
              minLabel="$5K"
              maxLabel="$500K"
            />

            <SliderField
              label="Payment Term"
              value={form.termDays}
              min={7}
              max={120}
              onChange={(v) => setField("termDays", v)}
              display={`${form.termDays} days`}
              minLabel="7d"
              maxLabel="120d"
            />

            <div className="glass-inset flex items-center justify-between px-4 py-2.5">
              <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                <CalendarClock size={13} />
                Implied due date
              </span>
              <span className="font-mono text-sm font-semibold text-slate-200">{formatDate(dueDate)}</span>
            </div>

            <div>
              <p className="label-glass">Debtor Payment History</p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <Stepper
                  label="Yrs trading"
                  value={form.debtorYearsTrading}
                  min={0}
                  max={40}
                  onChange={(v) => setField("debtorYearsTrading", v)}
                />
                <Stepper
                  label="Paid"
                  value={form.priorInvoicesPaid}
                  min={0}
                  max={60}
                  onChange={(v) => setField("priorInvoicesPaid", v)}
                />
                <Stepper
                  label="Defaulted"
                  value={form.priorInvoicesDefaulted}
                  min={0}
                  max={15}
                  onChange={(v) => setField("priorInvoicesDefaulted", v)}
                />
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Verdict */}
        <GlassCard className="lg:col-span-3">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-violetx-soft" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Sentry Verdict</h2>
            </div>
            <Badge status={tier} />
          </div>

          <div className="flex flex-col gap-8 md:flex-row md:items-start">
            <div className="flex shrink-0 flex-col items-center gap-3">
              <RiskGauge score={result.riskScore} size={184} label="AI Risk Score" />
              <p className="text-center text-[11px] text-slate-500">
                0–100 · higher is safer
                <br />
                <span className="font-mono text-slate-400">tier: {tier}</span>
              </p>
            </div>

            <div className="min-w-0 flex-1 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <MetricTile
                  icon={ShieldCheck}
                  label="Fraud Probability"
                  value={formatPercent(result.fraudProbability, 1)}
                  tone={fraudTone}
                  sub="Anomaly + signal detection"
                />
                <MetricTile
                  icon={Percent}
                  label="Discount Rate"
                  value={bpsToPercent(result.discountRateBps)}
                  sub={`${result.discountRateBps} bps · risk + time value`}
                />
                <MetricTile
                  icon={Zap}
                  label="Advance Rate"
                  value={formatPercent(result.advanceRatePct, 0)}
                  tone="text-electric-soft"
                  sub={`${formatUSD(advanceUSD)} streamed upfront`}
                />
                <MetricTile
                  icon={TrendingUp}
                  label="Projected Yield"
                  value={`${formatPercent(result.expectedYieldAPY, 2)} APY`}
                  tone="text-emeraldx-soft"
                  sub="For vault liquidity providers"
                />
              </div>

              <div className="glass-inset flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-xs">
                <span className="flex items-center gap-2 text-slate-400">
                  <CircleDollarSign size={13} className="text-electric-soft" />
                  Economics on {formatUSD(form.faceValueUSD)}
                </span>
                <span className="font-mono text-slate-300">
                  advance {formatUSD(advanceUSD)} · discount fee {formatUSD(discountFeeUSD)}
                </span>
              </div>

              <div className="glass-inset px-4 py-3">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <Fingerprint size={13} className="text-violetx-soft" />
                  Deterministic audit commitment
                </div>
                <p className="mt-1.5 break-all font-mono text-[11px] leading-relaxed text-electric-soft">
                  {result.auditHash}
                </p>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Recomputable by anyone from the same payload — committed on-chain via{" "}
                  <span className="font-mono text-slate-400">commitRiskScore()</span> so the score can never be
                  silently rewritten.
                </p>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Factors + rationale */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GlassCard>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-electric-soft" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Factor Breakdown</h2>
            </div>
            <span className="text-[11px] text-slate-500">{result.factors.length} weighted signals</span>
          </div>
          <div className="space-y-5">
            {result.factors.map((factor, idx) => {
              const style = IMPACT_STYLES[factor.impact] || IMPACT_STYLES.neutral;
              const ImpactIcon = style.icon;
              return (
                <motion.div
                  key={factor.key}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + idx * 0.05, duration: 0.35 }}
                >
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-200">{factor.label}</span>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                        style.chip
                      )}
                    >
                      <ImpactIcon size={11} />
                      {factor.impact}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <ProgressBar value={factor.score} accent={style.bar} className="flex-1" />
                    <span className="w-9 shrink-0 text-right font-mono text-xs font-bold text-white">
                      {Math.round(factor.score)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-3">
                    <p className={cn("min-w-0 text-[11px] leading-relaxed", style.text)}>{factor.note}</p>
                    <span className="shrink-0 font-mono text-[10px] text-slate-500">
                      w {Math.round(factor.weight * 100)}%
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </GlassCard>

        {/* Terminal rationale */}
        <GlassCard className="flex flex-col p-0">
          <div className="flex items-center justify-between border-b border-slate-700/50 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Terminal size={16} className="text-emeraldx-soft" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-white">Underwriting Rationale</h2>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emeraldx/70" />
            </div>
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto rounded-b-2xl bg-abyss/70 p-5 font-mono text-xs leading-relaxed">
            <p className="mb-3 text-slate-500">
              sentry@botchain:~$ <span className="text-slate-300">underwrite --model {SENTRY_MODEL_ID} --explain</span>
            </p>
            {result.rationale.map((line, idx) => (
              <div key={idx} className="mb-1.5 flex gap-2.5">
                <span className="shrink-0 select-none text-slate-600">{String(idx + 1).padStart(2, "0")}</span>
                <span className="shrink-0 select-none text-emeraldx-soft">›</span>
                <span className="min-w-0 break-words text-slate-300">{line}</span>
              </div>
            ))}
            <div className="mt-3 flex gap-2.5 text-violetx-soft">
              <span className="shrink-0 select-none text-slate-600">✓</span>
              <span className="min-w-0 break-all">
                audit_hash={result.auditHash}
              </span>
            </div>
            <p className="mt-2 flex items-center text-slate-500">
              verdict committed · deterministic · replayable
              <span className="ml-2 inline-block h-3.5 w-1.5 animate-pulse rounded-[1px] bg-emeraldx-soft/80" />
            </p>
          </div>
        </GlassCard>
      </div>

      {/* Sentry Network */}
      <div>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-white">
              <Network size={18} className="text-violetx-soft" />
              Sentry Network
            </h2>
            <p className="mt-0.5 text-sm text-slate-400">
              AI agents registered on <span className="font-mono text-xs text-slate-300">SynturaSentryRegistry</span> —
              only verified sentries can commit risk scores on-chain.
            </p>
          </div>
          <span className="font-mono text-xs text-slate-500">
            registry:{" "}
            {CONTRACTS.sentryRegistry ? (
              <a
                href={explorerAddressUrl(CONTRACTS.sentryRegistry)}
                target="_blank"
                rel="noreferrer"
                className="text-electric-soft transition-colors hover:text-white"
              >
                {shortAddress(CONTRACTS.sentryRegistry)}
              </a>
            ) : (
              <span className="text-amber-300/80">{liveMode ? "configured" : "demo simulation"}</span>
            )}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {/* Verified primary sentry */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
          >
            <GlassCard hover className="h-full border-emeraldx/20">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-emeraldx/30 bg-emeraldx/10 text-emeraldx-soft">
                  <Bot size={20} />
                </div>
                <SentryStatusChip tone="verified" icon={BadgeCheck}>
                  Verified
                </SentryStatusChip>
              </div>
              <p className="mt-4 font-mono text-sm font-bold text-white">{SENTRY_MODEL_ID}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Primary underwriting sentry · this sandbox</p>
              <div className="mt-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400">Agent address</span>
                  <a
                    href={explorerAddressUrl(SENTRY_AGENT_ADDRESS)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-electric-soft transition-colors hover:text-white"
                  >
                    {shortAddress(SENTRY_AGENT_ADDRESS)}
                    <ExternalLink size={11} />
                  </a>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400">Risk commitments</span>
                  <span className="font-mono font-bold text-white">{commitments}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400">Scoring</span>
                  <span className="font-mono text-slate-300">deterministic · auditable</span>
                </div>
              </div>
              <p className="mt-4 rounded-lg border border-slate-800/80 bg-abyss/60 px-3 py-2 font-mono text-[10px] leading-relaxed text-slate-500">
                commitRiskScore(invoiceId, riskScore, auditHash)
              </p>
            </GlassCard>
          </motion.div>

          {/* Staging sentry */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22, duration: 0.4 }}
          >
            <GlassCard hover className="h-full">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
                  <Cpu size={20} />
                </div>
                <SentryStatusChip tone="staging" icon={Activity}>
                  Staging
                </SentryStatusChip>
              </div>
              <p className="mt-4 font-mono text-sm font-bold text-white">syntura-sentry-v2-rc1</p>
              <p className="mt-0.5 text-[11px] text-slate-500">Next-gen model · shadow-scoring pipeline</p>
              <div className="mt-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400">Agent address</span>
                  <span className="font-mono text-slate-500">pending registration</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400">Risk commitments</span>
                  <span className="font-mono font-bold text-white">0</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400">Scoring</span>
                  <span className="font-mono text-slate-300">shadow mode only</span>
                </div>
              </div>
              <p className="mt-4 rounded-lg border border-slate-800/80 bg-abyss/60 px-3 py-2 font-mono text-[10px] leading-relaxed text-slate-500">
                Promoted once shadow scores match v1 commitments across 500 invoices.
              </p>
            </GlassCard>
          </motion.div>

          {/* Open registry slot */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.29, duration: 0.4 }}
          >
            <div className="flex h-full flex-col rounded-2xl border border-dashed border-slate-700/70 bg-panel/20 p-6 transition-colors duration-300 hover:border-violetx/50">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700/60 bg-panel/40 text-slate-500">
                  <Plus size={20} />
                </div>
                <SentryStatusChip tone="open" icon={Network}>
                  Open Slot
                </SentryStatusChip>
              </div>
              <p className="mt-4 text-sm font-bold text-slate-300">Register a sentry</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Third-party AI underwriters join the network through governance-gated registration.
              </p>
              <div className="mt-4 flex-1 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400">Access</span>
                  <span className="font-mono text-slate-300">onlyOwner</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-400">Requirement</span>
                  <span className="font-mono text-slate-300">verifiable model ID</span>
                </div>
              </div>
              <p className="mt-4 rounded-lg border border-slate-800/80 bg-abyss/60 px-3 py-2 font-mono text-[10px] leading-relaxed text-slate-500">
                registerSentry(address agent, string modelId)
              </p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Footnote: latest on-chain commitment reference */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/70 bg-panel/20 px-5 py-3.5">
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck size={14} className="text-emeraldx-soft" />
          Every underwriting emits <span className="font-mono text-slate-400">RiskScoreCommitted</span> on BOTChain —
          latest commitment:
        </p>
        <TxLink hash={invoices.find((i) => i.riskScore > 0)?.txHash} />
      </div>
    </motion.div>
  );
}
