import React from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ExternalLink,
  FilePlus2,
  Github,
  Hexagon,
  ShieldCheck,
  Sparkles,
  Waves,
} from "lucide-react";
import { Badge, GlassCard, ProgressBar, RiskGauge, SectionTitle } from "../components/ui/Glass.jsx";
import { bpsToPercent, cn, formatPercent, formatUSD, shortHash } from "../lib/utils.js";
import { useSyntura } from "../context/SynturaStore.jsx";
import { SENTRY_MODEL_ID, underwriteInvoice } from "../agent/aiSentryAgent.js";

const GITHUB_URL = "https://github.com/mrnetwork0001/Syntura";

// Real underwriting run once at module load — pinned payload + asOf so the
// terminal output is identical on every visit. Not a mockup.
const SAMPLE_PAYLOAD = {
  debtorName: "Dangote Industries",
  supplierName: "Lagos Logistics Co.",
  faceValueUSD: 125000,
  termDays: 45,
  sector: "Logistics & Freight",
  dueDate: "2026-09-25",
  asOf: "2026-08-11",
};
const SAMPLE = underwriteInvoice(SAMPLE_PAYLOAD);

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.5, ease: "easeOut" },
};

const NAV_LINKS = [
  { label: "Protocol", id: "protocol" },
  { label: "How It Works", id: "how-it-works" },
  { label: "AI Sentry", id: "ai-sentry" },
  { label: "For Investors", id: "for-investors" },
];

const STAGES = [
  {
    n: "01",
    title: "Tokenize",
    icon: FilePlus2,
    border: "border-t-electric",
    chip: "text-electric-soft bg-electric/10 border-electric/30",
    copy: "Each invoice is minted as an ERC-721 SYNV NFT on BOTChain — a verifiable on-chain claim on future cash flow.",
  },
  {
    n: "02",
    title: "AI Underwrite",
    icon: BrainCircuit,
    border: "border-t-violetx",
    chip: "text-violetx-soft bg-violetx/10 border-violetx/30",
    copy: "The AI Sentry computes a deterministic risk score and discount rate, committing an audit hash on-chain.",
  },
  {
    n: "03",
    title: "Stream",
    icon: Waves,
    border: "border-t-emeraldx",
    chip: "text-emeraldx-soft bg-emeraldx/10 border-emeraldx/30",
    copy: "The liquidity vault streams the advance to the supplier in real time — no 60-day wait for working capital.",
  },
  {
    n: "04",
    title: "Settle",
    icon: CheckCircle2,
    border: "border-t-amber-500",
    chip: "text-amber-400 bg-amber-500/10 border-amber-500/30",
    copy: "On payment, an atomic 90/7/3 split pays supplier, pool and treasury — LPs earn real-world yield.",
  },
];

const SENTRY_POINTS = [
  "Fully deterministic — identical input always yields an identical score and audit hash.",
  "Seven weighted risk factors plus fraud heuristics, every weight and rationale exposed.",
  "Every decision committed on-chain via SynturaSentryRegistry.commitRiskScore().",
];

const CHAIN_CHIPS = [
  { label: "Chain ID 677 (0x2a5)" },
  { label: "RPC rpc.botchain.ai" },
  { label: "Explorer scan.botchain.ai", href: "https://scan.botchain.ai" },
  { label: "EVM · Solidity 0.8.24" },
];

function scrollToId(e, id) {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-electric to-violetx text-white shadow-glow-blue">
        <Hexagon size={18} />
      </span>
      <span className="text-lg font-bold tracking-tight text-white">Syntura</span>
    </span>
  );
}

function SectionHeading({ eyebrow, title, subtitle }) {
  return (
    <div className="mb-12 max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-electric-soft">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{title}</h2>
      {subtitle && <p className="mt-3 text-slate-400">{subtitle}</p>}
    </div>
  );
}

export default function Landing({ onLaunch }) {
  const { invoices, vault } = useSyntura();

  const heroStats = [
    { value: String(invoices.length), label: "Invoices tokenized" },
    { value: formatUSD(vault.totalLiquidityUSD, { compact: true }), label: "Total liquidity" },
    { value: formatPercent(vault.averageYieldAPY), label: "Average APY" },
    { value: "677", label: "Chain ID" },
  ];

  return (
    <div className="min-h-screen">
      {/* ── Sticky nav ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-slate-800/60 bg-abyss/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <a href="#protocol" onClick={(e) => scrollToId(e, "protocol")} aria-label="Syntura — top">
            <Wordmark />
          </a>
          <nav className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((l) => (
              <a
                key={l.id}
                href={`#${l.id}`}
                onClick={(e) => scrollToId(e, l.id)}
                className="text-sm font-medium text-slate-400 transition-colors hover:text-white"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Syntura on GitHub"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700/70 bg-panel/40 text-slate-300 transition-colors hover:border-electric/50 hover:text-white"
            >
              <Github size={18} />
            </a>
            <button type="button" onClick={onLaunch} className="btn-primary">
              Launch dApp
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section id="protocol" className="relative scroll-mt-24 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 bg-grid-faint [background-size:48px_48px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]"
          aria-hidden="true"
        />
        <div className="relative mx-auto flex min-h-[88vh] max-w-6xl flex-col items-center justify-center px-6 py-24 text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="inline-flex items-center gap-2 rounded-full border border-violetx/40 bg-violetx/10 px-4 py-1.5 text-xs font-semibold text-violetx-soft"
          >
            <Sparkles size={14} />
            BOTChain Builder Challenge #2 · Season 2 — AI × RWA
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08, ease: "easeOut" }}
            className="mt-8 text-5xl font-extrabold leading-[1.06] tracking-tight text-white sm:text-6xl lg:text-7xl"
          >
            Real-world invoices,
            <br />
            <span className="text-gradient">{"underwritten by AI, paid in real time."}</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.16, ease: "easeOut" }}
            className="mt-6 max-w-2xl text-base text-slate-400 sm:text-lg"
          >
            Syntura tokenizes B2B invoices as RWA NFTs on BOTChain, prices their risk with a
            deterministic AI underwriting agent, and streams working capital to suppliers the moment
            the audit clears — settling every invoice with an atomic 90/7/3 split.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.24, ease: "easeOut" }}
            className="mt-10 flex flex-wrap items-center justify-center gap-4"
          >
            <button type="button" onClick={onLaunch} className="btn-primary px-7 py-3 text-base">
              Launch dApp
              <ArrowRight size={18} />
            </button>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="btn-ghost px-7 py-3 text-base">
              <Github size={18} />
              View source
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.34, ease: "easeOut" }}
            className="glass mt-14 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 rounded-2xl px-8 py-4 sm:rounded-full"
          >
            {heroStats.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-lg font-bold tracking-tight text-white">{s.value}</p>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Protocol in action ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <motion.div {...reveal}>
          <GlassCard className="p-6 sm:p-10">
            <div className="grid items-center gap-6 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
              <div className="glass-inset p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-slate-400">#SYNV-006</span>
                  <Badge status="Underwritten" />
                </div>
                <p className="mt-4 text-2xl font-bold tracking-tight text-white">{formatUSD(67500)}</p>
                <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-500">
                  Invoice face value · 45-day term
                </p>
              </div>

              <ArrowRight size={20} className="mx-auto rotate-90 text-slate-600 md:rotate-0" />

              <div className="flex flex-col items-center py-2">
                <RiskGauge score={87} size={132} />
                <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  AI Sentry
                </p>
              </div>

              <ArrowRight size={20} className="mx-auto rotate-90 text-slate-600 md:rotate-0" />

              <div className="glass-inset p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Streaming advance
                  </span>
                  <Badge status="Streaming" />
                </div>
                <ProgressBar value={62} accent="violet" className="mt-5" />
                <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                  <ArrowRight size={13} className="text-emeraldx-soft" />
                  90/7/3 settlement
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
        <motion.div {...reveal}>
          <SectionHeading
            eyebrow="Pipeline"
            title="From invoice to liquidity in four stages"
            subtitle="One protocol carries every invoice from mint to settlement — each stage anchored on BOTChain."
          />
        </motion.div>
        <div className="grid gap-5 md:grid-cols-4">
          {STAGES.map((s, i) => (
            <motion.div
              key={s.n}
              {...reveal}
              transition={{ ...reveal.transition, delay: i * 0.08 }}
              className={cn("glass border-t-2 p-6", s.border)}
            >
              <div className="flex items-center justify-between">
                <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl border", s.chip)}>
                  <s.icon size={18} />
                </span>
                <span className="font-mono text-xs text-slate-600">{s.n}</span>
              </div>
              <h3 className="mt-5 text-base font-bold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.copy}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── AI Sentry deep-dive ────────────────────────────────────────── */}
      <section id="ai-sentry" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <motion.div {...reveal} className="min-w-0">
            <SectionHeading
              eyebrow="AI Risk Sentry"
              title="An underwriter you can audit"
              subtitle={`${SENTRY_MODEL_ID} prices every invoice with explainable, reproducible math — no black box between risk and rate.`}
            />
            <ul className="space-y-4">
              {SENTRY_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-3">
                  <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emeraldx-soft" />
                  <span className="text-sm leading-relaxed text-slate-300">{point}</span>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div
            {...reveal}
            transition={{ ...reveal.transition, delay: 0.1 }}
            className="min-w-0"
          >
            <div className="glass-inset overflow-hidden">
              <div className="flex items-center gap-2 border-b border-slate-800/80 px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
                <span className="h-2.5 w-2.5 rounded-full bg-emeraldx/70" />
                <span className="ml-2 font-mono text-[11px] text-slate-500">
                  sentry — underwrite "{SAMPLE_PAYLOAD.debtorName}"
                </span>
              </div>
              <div className="max-h-80 space-y-1.5 overflow-y-auto p-4 font-mono text-xs leading-relaxed scrollbar-thin">
                {SAMPLE.rationale.map((line, i) => (
                  <p key={i} className="[overflow-wrap:anywhere] text-slate-400">
                    <span className="mr-1.5 text-slate-600">›</span>
                    {line}
                  </p>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 border-t border-slate-800/80 px-4 py-3 font-mono text-xs">
                <div>
                  <p className="text-slate-500">riskScore</p>
                  <p className="mt-0.5 font-semibold text-emeraldx-soft">{SAMPLE.riskScore}/100</p>
                </div>
                <div>
                  <p className="text-slate-500">discount</p>
                  <p className="mt-0.5 font-semibold text-electric-soft">{bpsToPercent(SAMPLE.discountRateBps)}</p>
                </div>
                <div>
                  <p className="text-slate-500">auditHash</p>
                  <p className="mt-0.5 font-semibold text-violetx-soft">{shortHash(SAMPLE.auditHash)}</p>
                </div>
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-slate-500">
              Live output from the actual model in this repo — not a mockup.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── For investors ──────────────────────────────────────────────── */}
      <section id="for-investors" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <motion.div {...reveal} className="min-w-0">
            <SectionHeading
              eyebrow="Liquidity providers"
              title="Real-world yield, streamed on-chain"
              subtitle="Every settled invoice routes 7% of its face value to the liquidity pool. Yield comes from real B2B cash flows — invoices paid by real debtors — not token emissions."
            />
            <div className="grid grid-cols-2 gap-4">
              <div className="glass-inset p-4">
                <p className="text-2xl font-bold tracking-tight text-white">
                  {formatPercent(vault.averageYieldAPY)}
                </p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Average APY
                </p>
              </div>
              <div className="glass-inset p-4">
                <p className="text-2xl font-bold tracking-tight text-white">
                  {formatPercent(vault.poolUtilizationPct, 1)}
                </p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Pool utilization
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div {...reveal} transition={{ ...reveal.transition, delay: 0.1 }}>
            <GlassCard className="p-8">
              <SectionTitle
                title="Atomic settlement split"
                subtitle="Executed in a single transaction on every settlement."
              />
              <div className="flex h-5 overflow-hidden rounded-full">
                <div className="bg-electric" style={{ width: "90%" }} />
                <div className="bg-violetx" style={{ width: "7%" }} />
                <div className="bg-emeraldx" style={{ width: "3%" }} />
              </div>
              <div className="mt-5 space-y-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-300">
                    <span className="h-2.5 w-2.5 rounded-full bg-electric" />
                    Supplier payout
                  </span>
                  <span className="font-semibold text-white">90%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-300">
                    <span className="h-2.5 w-2.5 rounded-full bg-violetx" />
                    Liquidity pool
                  </span>
                  <span className="font-semibold text-white">7%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-slate-300">
                    <span className="h-2.5 w-2.5 rounded-full bg-emeraldx" />
                    Protocol treasury
                  </span>
                  <span className="font-semibold text-white">3%</span>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </section>

      {/* ── Built on BOTChain ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <motion.div {...reveal} className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-electric-soft">
            Built on BOTChain
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {CHAIN_CHIPS.map((chip) =>
              chip.href ? (
                <a
                  key={chip.label}
                  href={chip.href}
                  target="_blank"
                  rel="noreferrer"
                  className="glass inline-flex items-center gap-1.5 rounded-full px-4 py-2 font-mono text-xs text-slate-300 transition-colors hover:border-electric/40 hover:text-white"
                >
                  {chip.label}
                  <ExternalLink size={12} />
                </a>
              ) : (
                <span
                  key={chip.label}
                  className="glass inline-flex items-center rounded-full px-4 py-2 font-mono text-xs text-slate-300"
                >
                  {chip.label}
                </span>
              )
            )}
          </div>
          <p className="mt-6 text-sm text-slate-400">
            Track 1 (AI-native agents) × Track 2 (RWA applications) — one protocol.
          </p>
        </motion.div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <motion.div {...reveal}>
          <GlassCard className="p-12 text-center shadow-glow-blue sm:p-16">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              See the whole protocol run <span className="text-gradient">in 60 seconds.</span>
            </h2>
            <p className="mt-4 text-slate-400">No wallet needed — demo mode is fully clickable.</p>
            <button type="button" onClick={onLaunch} className="btn-primary mt-8 px-8 py-3.5 text-base">
              Launch dApp
              <ArrowRight size={18} />
            </button>
          </GlassCard>
        </motion.div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8">
          <Wordmark />
          <p className="text-xs text-slate-500">
            Apache-2.0 · Built by Ifeanyichukwu Onwo (mrnetwork) for the BOTChain Builder Challenge #2
          </p>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-white"
          >
            <Github size={14} />
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
