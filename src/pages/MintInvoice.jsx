import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FilePlus2,
  BrainCircuit,
  Loader2,
  CheckCircle2,
  Fingerprint,
  Hexagon,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Minus,
  LayoutDashboard,
  RotateCcw,
  AlertTriangle,
  Bot,
  FileText,
  Waves,
} from "lucide-react";
import {
  GlassCard,
  SectionTitle,
  Badge,
  TxLink,
  ProgressBar,
  RiskGauge,
} from "../components/ui/Glass.jsx";
import {
  cn,
  formatUSD,
  formatPercent,
  bpsToPercent,
  formatDate,
  daysUntil,
} from "../lib/utils.js";
import { SECTORS } from "../lib/mockData.js";
import { useSyntura } from "../context/SynturaStore.jsx";
import { underwriteInvoice, SENTRY_MODEL_ID } from "../agent/aiSentryAgent.js";

const ANALYSIS_STAGES = [
  "Ingesting invoice metadata & debtor identity",
  "Scoring debtor credit heuristics & payment history",
  "Scanning fraud signals — amount patterns, term mismatch",
  "Pricing discount rate & advance terms against tenor",
  "Committing deterministic audit hash for on-chain proof",
];

const STAGE_MS = 340;

const IMPACT_STYLES = {
  positive: { text: "text-emeraldx-soft", accent: "emerald", Icon: TrendingUp },
  negative: { text: "text-rose-400", accent: "violet", Icon: TrendingDown },
  neutral: { text: "text-slate-400", accent: "electric", Icon: Minus },
};

const PIPELINE_STEPS = [
  {
    icon: FileText,
    title: "Submit invoice details",
    note: "Debtor, face value, tenor & sector feed the underwriting model.",
  },
  {
    icon: BrainCircuit,
    title: "AI Sentry underwrites in seconds",
    note: "Multi-factor risk scoring, fraud detection & discount pricing.",
  },
  {
    icon: Fingerprint,
    title: "Audit hash committed on-chain",
    note: "A deterministic commitment makes every decision verifiable.",
  },
  {
    icon: Hexagon,
    title: "ERC-721 minted on BOTChain",
    note: "Your invoice becomes a yield-streaming RWA NFT instantly.",
  },
];

const addDaysISO = (days) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const defaultForm = () => ({
  supplierName: "",
  debtorName: "",
  sector: SECTORS[0],
  faceValueUSD: "",
  termDays: "45",
  dueDate: addDaysISO(45),
});

function validate(form) {
  const errors = {};
  if (!form.supplierName.trim() || form.supplierName.trim().length < 2)
    errors.supplierName = "Supplier name is required (min 2 characters).";
  if (!form.debtorName.trim() || form.debtorName.trim().length < 2)
    errors.debtorName = "Debtor name is required (min 2 characters).";
  if (!SECTORS.includes(form.sector)) errors.sector = "Select a valid sector.";
  const fv = Number(form.faceValueUSD);
  if (!form.faceValueUSD || Number.isNaN(fv))
    errors.faceValueUSD = "Enter the invoice face value in USD.";
  else if (fv < 100) errors.faceValueUSD = "Minimum tokenizable value is $100.";
  else if (fv > 50_000_000)
    errors.faceValueUSD = "Maximum tokenizable value is $50,000,000.";
  const term = Number(form.termDays);
  if (!form.termDays || Number.isNaN(term) || !Number.isInteger(term))
    errors.termDays = "Payment term must be a whole number of days.";
  else if (term < 1 || term > 365)
    errors.termDays = "Payment term must be between 1 and 365 days.";
  if (!form.dueDate) errors.dueDate = "Select the invoice due date.";
  else if (daysUntil(form.dueDate) < 1)
    errors.dueDate = "Due date must be in the future.";
  return errors;
}

function Field({ label, error, children }) {
  return (
    <div>
      <label className="label-glass">{label}</label>
      {children}
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-1.5 flex items-center gap-1 text-xs text-rose-400"
          >
            <AlertTriangle size={12} />
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function Metric({ label, value, tone = "text-white" }) {
  return (
    <div className="glass-inset rounded-xl p-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className={cn("mt-1 text-lg font-bold tracking-tight", tone)}>{value}</p>
    </div>
  );
}

export default function MintInvoice() {
  const { tokenizeInvoice } = useSyntura();

  const [form, setForm] = useState(defaultForm);
  const [errors, setErrors] = useState({});
  // idle → analyzing → result → minting → minted
  const [phase, setPhase] = useState("idle");
  const [stageIndex, setStageIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [analyzedPayload, setAnalyzedPayload] = useState(null);
  const [mintedInvoice, setMintedInvoice] = useState(null);
  const [mintError, setMintError] = useState(null);

  const timersRef = useRef([]);
  const dueDateTouched = useRef(false);

  useEffect(
    () => () => {
      timersRef.current.forEach(clearTimeout);
    },
    []
  );

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const onTermChange = (value) => {
    setField("termDays", value);
    const term = Number(value);
    // Keep due date in lockstep with tenor until the user edits it directly.
    if (!dueDateTouched.current && Number.isInteger(term) && term > 0 && term <= 365) {
      setForm((f) => ({ ...f, termDays: value, dueDate: addDaysISO(term) }));
    }
  };

  const onDueDateChange = (value) => {
    dueDateTouched.current = true;
    const days = value ? daysUntil(value) : null;
    setForm((f) => ({
      ...f,
      dueDate: value,
      termDays: days && days > 0 && days <= 365 ? String(days) : f.termDays,
    }));
    setErrors((e) => ({ ...e, dueDate: undefined, termDays: undefined }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (phase === "analyzing" || phase === "minting") return;
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    const payload = {
      supplierName: form.supplierName.trim(),
      debtorName: form.debtorName.trim(),
      sector: form.sector,
      faceValueUSD: Number(form.faceValueUSD),
      termDays: Number(form.termDays),
      dueDate: form.dueDate,
    };

    clearTimers();
    setMintError(null);
    setMintedInvoice(null);
    setResult(null);
    setStageIndex(0);
    setPhase("analyzing");

    ANALYSIS_STAGES.forEach((_, i) => {
      timersRef.current.push(
        setTimeout(() => setStageIndex(i + 1), (i + 1) * STAGE_MS)
      );
    });
    timersRef.current.push(
      setTimeout(() => {
        try {
          setResult(underwriteInvoice(payload));
          setAnalyzedPayload(payload);
          setPhase("result");
        } catch {
          setPhase("idle");
          setMintError("AI Sentry analysis failed — please retry.");
        }
      }, ANALYSIS_STAGES.length * STAGE_MS + 240)
    );
  };

  const handleMint = async () => {
    if (!result || !analyzedPayload || phase === "minting") return;
    setMintError(null);
    setPhase("minting");
    try {
      const invoice = await tokenizeInvoice(analyzedPayload, result);
      setMintedInvoice(invoice);
      setPhase("minted");
    } catch {
      setPhase("result");
      setMintError("Mint transaction failed — please retry.");
    }
  };

  const handleReset = () => {
    clearTimers();
    dueDateTouched.current = false;
    setForm(defaultForm());
    setErrors({});
    setResult(null);
    setAnalyzedPayload(null);
    setMintedInvoice(null);
    setMintError(null);
    setStageIndex(0);
    setPhase("idle");
  };

  const goToDashboard = () => {
    window.dispatchEvent(
      new CustomEvent("syntura:navigate", { detail: { page: "dashboard" } })
    );
  };

  const busy = phase === "analyzing" || phase === "minting";
  const invoiceTag = mintedInvoice
    ? `#SYNV-${String(mintedInvoice.id).padStart(3, "0")}`
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
    >
      <SectionTitle
        title="Tokenize an Invoice"
        subtitle="Turn a real-world receivable into a yield-streaming RWA NFT — underwritten by the AI Risk Sentry before it ever touches the chain."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ------------------------------ Form ------------------------------ */}
        <GlassCard className="h-fit">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-electric/30 bg-electric/10 text-electric-soft">
              <FilePlus2 size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Invoice Details</h3>
              <p className="text-xs text-slate-400">
                All fields validated before AI underwriting
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Supplier Name" error={errors.supplierName}>
              <input
                type="text"
                className="input-glass"
                placeholder="e.g. Meridian Logistics Ltd"
                value={form.supplierName}
                onChange={(e) => setField("supplierName", e.target.value)}
                disabled={busy}
                maxLength={64}
              />
            </Field>

            <Field label="Debtor Name" error={errors.debtorName}>
              <input
                type="text"
                className="input-glass"
                placeholder="e.g. Vertex Manufacturing Group"
                value={form.debtorName}
                onChange={(e) => setField("debtorName", e.target.value)}
                disabled={busy}
                maxLength={64}
              />
            </Field>

            <Field label="Sector" error={errors.sector}>
              <select
                className="input-glass"
                value={form.sector}
                onChange={(e) => setField("sector", e.target.value)}
                disabled={busy}
              >
                {SECTORS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Face Value (USD)" error={errors.faceValueUSD}>
                <input
                  type="number"
                  className="input-glass"
                  placeholder="125000"
                  min="100"
                  max="50000000"
                  step="1"
                  value={form.faceValueUSD}
                  onChange={(e) => setField("faceValueUSD", e.target.value)}
                  disabled={busy}
                />
              </Field>

              <Field label="Payment Term (days)" error={errors.termDays}>
                <input
                  type="number"
                  className="input-glass"
                  placeholder="45"
                  min="1"
                  max="365"
                  step="1"
                  value={form.termDays}
                  onChange={(e) => onTermChange(e.target.value)}
                  disabled={busy}
                />
              </Field>
            </div>

            <Field label="Due Date" error={errors.dueDate}>
              <input
                type="date"
                className="input-glass"
                min={addDaysISO(1)}
                value={form.dueDate}
                onChange={(e) => onDueDateChange(e.target.value)}
                disabled={busy}
              />
            </Field>

            <button
              type="submit"
              className="btn-primary w-full justify-center"
              disabled={busy}
            >
              {phase === "analyzing" ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  AI Sentry analyzing…
                </>
              ) : (
                <>
                  <BrainCircuit size={16} />
                  {phase === "result" || phase === "minted" || phase === "minting"
                    ? "Re-run AI Underwriting"
                    : "Run AI Underwriting"}
                </>
              )}
            </button>

            {mintError && phase === "idle" && (
              <p className="flex items-center gap-1.5 text-xs text-rose-400">
                <AlertTriangle size={12} />
                {mintError}
              </p>
            )}
          </form>
        </GlassCard>

        {/* --------------------------- Right panel --------------------------- */}
        <div className="min-h-[420px]">
          <AnimatePresence mode="wait">
            {phase === "idle" && (
              <motion.div
                key="idle"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35 }}
              >
                <GlassCard>
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violetx/30 bg-violetx/10 text-violetx-soft">
                      <Bot size={18} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        How Autonomous Tokenization Works
                      </h3>
                      <p className="text-xs text-slate-400">
                        Four steps, zero manual underwriters
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {PIPELINE_STEPS.map((step, i) => (
                      <motion.div
                        key={step.title}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + i * 0.08, duration: 0.35 }}
                        className="glass-inset flex items-start gap-4 rounded-xl p-4"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-electric/25 bg-electric/10 text-electric-soft">
                          <step.icon size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">
                            <span className="mr-2 font-mono text-xs text-slate-500">
                              0{i + 1}
                            </span>
                            {step.title}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">{step.note}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                  <div className="mt-5 flex items-center gap-2 rounded-xl border border-emeraldx/20 bg-emeraldx/5 p-3.5 text-xs text-slate-300">
                    <ShieldCheck size={14} className="shrink-0 text-emeraldx-soft" />
                    Every underwriting decision is deterministic and committed on-chain
                    as an audit hash — verifiable by anyone, forever.
                  </div>
                </GlassCard>
              </motion.div>
            )}

            {phase === "analyzing" && (
              <motion.div
                key="analyzing"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
              >
                <GlassCard>
                  <div className="mb-5 flex items-center gap-3">
                    <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-electric/40 bg-electric/10 text-electric-soft shadow-glow-blue">
                      <BrainCircuit size={18} className="animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        AI Sentry Analyzing…
                      </h3>
                      <p className="font-mono text-[11px] text-slate-400">
                        {SENTRY_MODEL_ID} · deterministic multi-factor model
                      </p>
                    </div>
                  </div>

                  <ProgressBar
                    value={(stageIndex / ANALYSIS_STAGES.length) * 100}
                    accent="electric"
                    className="mb-5"
                  />

                  <div className="space-y-2.5">
                    {ANALYSIS_STAGES.map((stage, i) => {
                      const done = stageIndex > i;
                      const active = stageIndex === i;
                      return (
                        <motion.div
                          key={stage}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: done || active ? 1 : 0.35, x: 0 }}
                          transition={{ delay: i * 0.05, duration: 0.25 }}
                          className="flex items-center gap-3 font-mono text-xs"
                        >
                          {done ? (
                            <CheckCircle2 size={14} className="shrink-0 text-emeraldx-soft" />
                          ) : active ? (
                            <Loader2 size={14} className="shrink-0 animate-spin text-electric-soft" />
                          ) : (
                            <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-700" />
                          )}
                          <span className={done ? "text-slate-300" : active ? "text-white" : "text-slate-500"}>
                            {stage}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                </GlassCard>
              </motion.div>
            )}

            {(phase === "result" || phase === "minting") && result && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.35 }}
                className="space-y-6"
              >
                <GlassCard>
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emeraldx/30 bg-emeraldx/10 text-emeraldx-soft">
                        <ShieldCheck size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white">
                          Underwriting Complete
                        </h3>
                        <p className="font-mono text-[11px] text-slate-400">
                          {SENTRY_MODEL_ID}
                        </p>
                      </div>
                    </div>
                    <Badge status={result.tier} />
                  </div>

                  <div className="flex flex-col items-center gap-6 sm:flex-row">
                    <RiskGauge score={result.riskScore} />
                    <div className="grid w-full grid-cols-2 gap-3">
                      <Metric
                        label="Fraud Probability"
                        value={formatPercent(result.fraudProbability, 1)}
                        tone={result.fraudProbability >= 15 ? "text-rose-400" : "text-white"}
                      />
                      <Metric
                        label="Discount Rate"
                        value={bpsToPercent(result.discountRateBps)}
                      />
                      <Metric
                        label="Advance Rate"
                        value={formatPercent(result.advanceRatePct, 0)}
                        tone="text-electric-soft"
                      />
                      <Metric
                        label="Expected Yield APY"
                        value={formatPercent(result.expectedYieldAPY)}
                        tone="text-emeraldx-soft"
                      />
                    </div>
                  </div>

                  {analyzedPayload && (
                    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-800 pt-4 text-xs text-slate-400">
                      <span className="font-semibold text-slate-300">
                        {analyzedPayload.debtorName}
                      </span>
                      <span>{formatUSD(analyzedPayload.faceValueUSD)}</span>
                      <span>{analyzedPayload.termDays}-day term</span>
                      <span>Due {formatDate(analyzedPayload.dueDate)}</span>
                      <span>{analyzedPayload.sector}</span>
                    </div>
                  )}
                </GlassCard>

                <GlassCard>
                  <h3 className="mb-4 text-sm font-bold text-white">
                    Risk Factor Breakdown
                  </h3>
                  <div className="space-y-4">
                    {result.factors.map((f) => {
                      const style = IMPACT_STYLES[f.impact] || IMPACT_STYLES.neutral;
                      return (
                        <div key={f.key}>
                          <div className="mb-1.5 flex items-center justify-between gap-3">
                            <span className={cn("flex items-center gap-1.5 text-xs font-semibold", style.text)}>
                              <style.Icon size={13} />
                              {f.label}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">
                              {Math.round(f.score)}/100 · w {Number(f.weight).toFixed(2)}
                            </span>
                          </div>
                          <ProgressBar value={f.score} accent={style.accent} />
                          <p className="mt-1 text-[11px] text-slate-500">{f.note}</p>
                        </div>
                      );
                    })}
                  </div>
                </GlassCard>

                <GlassCard>
                  <h3 className="mb-3 text-sm font-bold text-white">
                    Sentry Rationale — Audit Trail
                  </h3>
                  <div className="glass-inset scrollbar-thin max-h-52 space-y-1.5 overflow-y-auto rounded-xl p-4 font-mono text-[11px] leading-relaxed">
                    {result.rationale.map((line, i) => (
                      <p key={i} className="text-slate-300">
                        <span className="mr-2 select-none text-electric-soft">›</span>
                        {line}
                      </p>
                    ))}
                  </div>

                  <div className="mt-4 rounded-xl border border-violetx/25 bg-violetx/5 p-3.5">
                    <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-violetx-soft">
                      <Fingerprint size={12} />
                      On-Chain Audit Commitment
                    </p>
                    <p className="break-all font-mono text-[11px] text-slate-400">
                      {result.auditHash}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleMint}
                    disabled={phase === "minting"}
                    className="btn-primary mt-5 w-full justify-center"
                  >
                    {phase === "minting" ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Minting on BOTChain…
                      </>
                    ) : (
                      <>
                        <Hexagon size={16} />
                        Mint RWA Invoice NFT on BOTChain
                      </>
                    )}
                  </button>

                  {mintError && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-rose-400">
                      <AlertTriangle size={12} />
                      {mintError}
                    </p>
                  )}
                </GlassCard>
              </motion.div>
            )}

            {phase === "minted" && mintedInvoice && result && (
              <motion.div
                key="minted"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4 }}
              >
                <GlassCard className="border-emeraldx/30 shadow-glow-emerald">
                  <div className="flex flex-col items-center py-4 text-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
                      className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-emeraldx/40 bg-emeraldx/10 text-emeraldx-soft shadow-glow-emerald"
                    >
                      <CheckCircle2 size={30} />
                    </motion.div>
                    <h3 className="text-xl font-bold tracking-tight text-white">
                      Invoice {invoiceTag} Minted
                    </h3>
                    <p className="mt-1 text-sm text-slate-400">
                      ERC-721 RWA Invoice NFT live on BOTChain — AI underwriting
                      committed on-chain.
                    </p>

                    <div className="mt-6 grid w-full grid-cols-2 gap-3 text-left sm:grid-cols-4">
                      <Metric label="Debtor" value={mintedInvoice.debtorName} />
                      <Metric
                        label="Face Value"
                        value={formatUSD(mintedInvoice.faceValueUSD)}
                      />
                      <Metric
                        label="AI Risk Score"
                        value={`${mintedInvoice.riskScore}/100`}
                        tone="text-emeraldx-soft"
                      />
                      <Metric
                        label="Discount"
                        value={bpsToPercent(mintedInvoice.discountRateBps)}
                      />
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs text-slate-400">
                      <Badge status={mintedInvoice.status} />
                      <span>Transaction</span>
                      <TxLink hash={mintedInvoice.txHash} />
                    </div>

                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-violetx/20 bg-violetx/5 px-4 py-2.5 text-xs text-slate-300">
                      <Waves size={14} className="shrink-0 text-violetx-soft" />
                      Status: Underwritten — start real-time payout streaming from the
                      Dashboard.
                    </div>

                    <div className="mt-6 flex w-full flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={goToDashboard}
                        className="btn-primary flex-1 justify-center"
                      >
                        <LayoutDashboard size={16} />
                        View in Dashboard
                      </button>
                      <button
                        type="button"
                        onClick={handleReset}
                        className="btn-ghost flex-1 justify-center"
                      >
                        <RotateCcw size={16} />
                        Tokenize Another Invoice
                      </button>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
