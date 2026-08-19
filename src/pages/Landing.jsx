import React, { useEffect, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import {
  BrainCircuit,
  CheckCircle2,
  ExternalLink,
  FilePlus2,
  Github,
  ShieldCheck,
  Waves,
  Zap,
} from "lucide-react";
import { useSyntura } from "../context/SynturaStore.jsx";
import BrandMark from "../components/ui/BrandMark.jsx";
import { underwriteInvoice, SENTRY_MODEL_ID } from "../agent/aiSentryAgent.js";
import { BOTCHAIN } from "../lib/chain.js";
import { cn, formatUSD, bpsToPercent } from "../lib/utils.js";

const GITHUB_URL = "https://github.com/mrnetwork0001/Syntura";
const X_URL = "https://x.com/SynturaHQ";

/** X wordmark glyph - lucide ships a close icon, not the brand mark. */
function XLogo({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/* A small book of real model runs, computed once at module load - the hero
   terminal cycles through them live, so every number on the landing page is
   actual output of the same engine that powers the dApp. */
const TERMINAL_BOOK = [
  {
    debtorName: "Dangote Industries",
    supplierName: "Lagos Logistics Co.",
    faceValueUSD: 125000,
    termDays: 45,
    dueDate: "2026-09-30",
    sector: "Logistics & Freight",
    debtorYearsTrading: 12,
    priorInvoicesPaid: 9,
    priorInvoicesDefaulted: 0,
  },
  {
    debtorName: "Safaricom PLC",
    supplierName: "Nairobi DevWorks",
    faceValueUSD: 48500,
    termDays: 30,
    dueDate: "2026-09-16",
    sector: "Software Services",
    debtorYearsTrading: 24,
    priorInvoicesPaid: 38,
    priorInvoicesDefaulted: 0,
  },
  {
    debtorName: "NovaTech Ventures",
    supplierName: "Kigali Creative Studio",
    faceValueUSD: 86200,
    termDays: 60,
    dueDate: "2026-10-16",
    sector: "Media & Design",
    debtorYearsTrading: 3,
    priorInvoicesPaid: 2,
    priorInvoicesDefaulted: 0,
  },
  {
    debtorName: "Quick Cash Trading",
    supplierName: "Meridian Exports",
    faceValueUSD: 500000,
    termDays: 118,
    dueDate: "2026-12-13",
    sector: "Other",
    debtorYearsTrading: 1,
    priorInvoicesPaid: 0,
    priorInvoicesDefaulted: 2,
  },
].map((payload) => ({ payload, verdict: underwriteInvoice(payload) }));

const TIER_TEXT = {
  Low: "text-emeraldx-soft",
  Medium: "text-amber-300",
  High: "text-rose-400",
};

const reveal = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.5, ease: "easeOut" },
};

function goto(page) {
  window.dispatchEvent(
    new CustomEvent("syntura:navigate", { detail: { page } })
  );
}

/* ── Small building blocks ─────────────────────────────────────────────── */

function Eyebrow({ children, className }) {
  return <p className={cn("eyebrow", className)}>{children}</p>;
}

function NavLink({ href, children }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        document
          .querySelector(href)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
      className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 transition-colors hover:text-white"
    >
      {children}
    </a>
  );
}

/* ── Hero terminal: continuously repricing sentry ticker ──────────────── */

function SentryTerminal({ onLaunch }) {
  const reduced = useReducedMotion();
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState("verdict"); // "evaluating" | "verdict"
  const [paused, setPaused] = useState(false);

  const { payload, verdict } = TERMINAL_BOOK[idx];
  const showVerdict = phase === "verdict";

  // Ticker loop: ingest -> evaluate (~1.4s) -> verdict (~5.6s) -> next.
  useEffect(() => {
    if (reduced || paused) return undefined;
    const t = setTimeout(
      () => {
        if (phase === "evaluating") setPhase("verdict");
        else {
          setIdx((i) => (i + 1) % TERMINAL_BOOK.length);
          setPhase("evaluating");
        }
      },
      phase === "evaluating" ? 1400 : 5600
    );
    return () => clearTimeout(t);
  }, [phase, idx, paused, reduced]);

  // Discount counts smoothly between verdicts.
  const bpsMv = useMotionValue(verdict.discountRateBps);
  useEffect(() => {
    if (!showVerdict) return undefined;
    const ctrl = animate(bpsMv, verdict.discountRateBps, {
      duration: reduced ? 0 : 0.9,
      ease: "easeOut",
    });
    return () => ctrl.stop();
  }, [showVerdict, verdict.discountRateBps, bpsMv, reduced]);
  const discountText = useTransform(bpsMv, (v) => `${(v / 100).toFixed(2)}%`);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.25, ease: "easeOut" }}
      className="glass min-w-0 p-5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-center justify-between">
        <Eyebrow>Invoice ingested</Eyebrow>
        <span className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-emeraldx-soft">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emeraldx" />
          Live
        </span>
      </div>

      <div className="glass-inset mt-4 overflow-hidden p-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <div className="flex items-center gap-2">
              <span className="rounded bg-electric/15 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-electric">
                SYNV
              </span>
              <span className="font-mono text-[10px] text-slate-600">just now</span>
            </div>
            <p className="mt-2 truncate text-sm font-semibold text-slate-200">
              {payload.debtorName} - {formatUSD(payload.faceValueUSD)} ·{" "}
              {payload.termDays}-day term
            </p>
            <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-slate-600">
              {payload.sector}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-4 flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.04]">
          <BrandMark
            size={15}
            className={cn(!showVerdict && "animate-pulse")}
          />
        </span>
        <div className="min-w-0">
          <Eyebrow className="tracking-[0.18em]">Syntura sentry evaluates</Eyebrow>
          <p className="truncate text-xs text-slate-400">
            {showVerdict
              ? "What should this invoice cost today?"
              : "Running 7-factor deterministic pass…"}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-slate-500">
          <span>Risk score</span>
          <span>0 - 100</span>
        </div>
        <div className="relative mt-2 h-1.5 rounded-full bg-white/[0.06]">
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violetx via-electric to-emeraldx"
            animate={{
              width: showVerdict ? `${verdict.riskScore}%` : "3%",
              opacity: showVerdict ? 1 : 0.4,
            }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
          <motion.span
            className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full border-2 border-abyss bg-white"
            animate={{
              left: showVerdict ? `calc(${verdict.riskScore}% - 7px)` : "0%",
              opacity: showVerdict ? 1 : 0,
              scale: showVerdict ? 1 : 0.5,
            }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
          />
        </div>
        <div className="mt-2 h-4 text-center font-mono text-[10px] uppercase tracking-wider">
          <AnimatePresence mode="wait" initial={false}>
            {showVerdict ? (
              <motion.p
                key={`score-${idx}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className={TIER_TEXT[verdict.tier] || "text-electric"}
              >
                {verdict.riskScore}/100 · Tier {verdict.tier}
              </motion.p>
            ) : (
              <motion.p
                key="pricing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="animate-pulse text-slate-600"
              >
                pricing…
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <Eyebrow>Discount priced</Eyebrow>
          <motion.p
            animate={{ opacity: showVerdict ? 1 : 0.3 }}
            transition={{ duration: 0.3 }}
            className="mt-1 font-mono text-2xl font-bold text-emeraldx-soft"
          >
            {discountText}
          </motion.p>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {showVerdict && (
            <motion.span
              key={`adv-${idx}`}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="rounded-full border border-emeraldx/40 bg-emeraldx/10 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-emeraldx-soft"
            >
              Advance {Math.round(verdict.advanceRatePct)}% of face
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-violetx/30 bg-violetx/[0.07] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Zap size={14} className="shrink-0 text-violetx-soft" />
          <div className="min-w-0">
            <p className="truncate font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-300">
              1-click mint ready
            </p>
            <p className="truncate font-mono text-[9px] text-slate-600">
              BOTChain · chain {BOTCHAIN.chainId} · unsigned until you approve
            </p>
          </div>
        </div>
        <button type="button" onClick={onLaunch} className="btn-primary shrink-0 !px-4 !py-2">
          Mint
        </button>
      </div>
    </motion.div>
  );
}

/* ── Sections ──────────────────────────────────────────────────────────── */

const STAGES = [
  {
    n: "01",
    fn: "mintInvoice()",
    title: "Tokenize",
    icon: FilePlus2,
    tone: "text-electric",
    copy: "Each invoice is minted as an ERC-721 SYNV NFT on BOTChain - a verifiable onchain claim on future cash flow.",
  },
  {
    n: "02",
    fn: "underwriteInvoice()",
    title: "AI Underwrite",
    icon: BrainCircuit,
    tone: "text-violetx-soft",
    copy: "The AI Sentry prices risk and discount rate deterministically, committing an audit hash of its reasoning onchain.",
  },
  {
    n: "03",
    fn: "streamPayout()",
    title: "Stream",
    icon: Waves,
    tone: "text-emeraldx-soft",
    copy: "The liquidity vault streams the advance to the supplier in real time - no 60-day wait for working capital.",
  },
  {
    n: "04",
    fn: "settleInvoice()",
    title: "Settle",
    icon: CheckCircle2,
    tone: "text-amber-400",
    copy: "On payment, an atomic 90/7/3 split pays supplier, pool and treasury - LPs earn real-world yield.",
  },
];

const CONTRACTS_GRID = [
  {
    name: "SynturaInvoiceNFT",
    chip: "ERC-721 · SYNV",
    copy: "The tokenized invoice registry: face value, debtor, due date, risk score and settlement state - every field a public, onchain claim.",
  },
  {
    name: "SynturaVault",
    chip: "9000/700/300 BPS",
    copy: "Liquidity deposits, real-time advance streaming and the atomic settlement waterfall, guarded by reentrancy checks and pull-payments.",
  },
  {
    name: "SynturaSentryRegistry",
    chip: "AUDIT ANCHORS",
    copy: "Onchain identity for AI agents. Only verified sentries underwrite, and every risk score is committed with a reproducible audit hash.",
  },
  {
    name: SENTRY_MODEL_ID,
    chip: "0 DEPS · DETERMINISTIC",
    copy: "The underwriting engine itself - seven weighted factors plus fraud heuristics, identical output for identical input, in browser or Node.",
  },
];

const TRUST = [
  {
    title: "Deterministic",
    copy: "No black box. Identical invoice payloads always produce identical scores and an identical audit hash - anyone can re-run the open-source model and verify what was committed onchain.",
  },
  {
    title: "Chain-pinned",
    copy: `Every contract call targets BOTChain (chain ID ${BOTCHAIN.chainId}). The frontend refuses to pretend: addresses, hashes and events deep-link to the public explorer.`,
  },
  {
    title: "Honest by default",
    copy: "Nothing is mocked. Every invoice, vault balance and audit entry is read from the contracts, and every action is a wallet-signed transaction - the app shows an explicitly empty state rather than fake data before deployment.",
  },
];

export default function Landing({ onLaunch }) {
  const { invoices, vault, protocolStats } = useSyntura();

  const heroStats = [
    { label: "Invoices", value: String(invoices.length) },
    {
      label: "Liquidity",
      value: formatUSD(vault.totalLiquidityUSD, { compact: true }),
    },
    { label: "AI verdicts", value: String(protocolStats.verdicts) },
    { label: "Active users", value: String(protocolStats.participants) },
  ];

  return (
    <div className="min-h-screen">
      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-abyss/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
              <BrandMark size={18} />
            </span>
            <span className="text-sm font-extrabold tracking-tight text-white">
              SYNTURA
            </span>
          </div>
          <nav className="flex items-center gap-7">
            <span className="hidden items-center gap-7 md:flex">
              <NavLink href="#pipeline">Pipeline</NavLink>
              <NavLink href="#contracts">Contracts</NavLink>
              <NavLink href="#trust">Trust</NavLink>
            </span>
            <button
              type="button"
              onClick={() => goto("docs")}
              className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500 transition-colors hover:text-white"
            >
              Docs
            </button>
          </nav>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:pb-28 lg:pt-24">
        <div className="min-w-0">
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="text-4xl font-extrabold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]"
          >
            We turn 60-day invoices into{" "}
            <span className="text-gradient">60-second liquidity.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.16 }}
            className="mt-5 max-w-xl text-[15px] leading-relaxed text-slate-400"
          >
            Syntura is an AI-underwritten invoice protocol. It tokenizes B2B
            receivables as RWA NFTs, prices their risk with a deterministic
            underwriting agent, and streams working capital to suppliers the
            moment the audit clears - settling every invoice with an atomic
            90/7/3 split. Auditable, always.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.24 }}
            className="mt-7 flex flex-wrap items-center gap-3"
          >
            <button type="button" onClick={onLaunch} className="btn-primary">
              Launch app
            </button>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="btn-ghost">
              <Github size={14} /> Browse source
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.36 }}
            className="mt-10 grid grid-cols-2 gap-6 border-t border-white/[0.06] pt-6 sm:grid-cols-4"
          >
            {heroStats.map((s) => (
              <div key={s.label} className="min-w-0">
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-slate-600">
                  {s.label}
                </p>
                <p className="mt-1.5 font-mono text-2xl font-bold text-white">
                  {s.value}
                </p>
              </div>
            ))}
          </motion.div>
        </div>

        <SentryTerminal onLaunch={onLaunch} />
      </section>

      {/* ── Pipeline ─────────────────────────────────────────────────── */}
      <section id="pipeline" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
        <motion.div {...reveal}>
          <Eyebrow>The pipeline</Eyebrow>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Four functions, every invoice.
          </h2>
        </motion.div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STAGES.map((s, i) => (
            <motion.div
              key={s.n}
              {...reveal}
              transition={{ ...reveal.transition, delay: i * 0.07 }}
              className="glass glass-hover min-w-0 p-6"
            >
              <div className="flex items-center justify-between">
                <span className={cn("font-mono text-xl font-bold", s.tone)}>{s.n}</span>
                <s.icon size={16} className="text-slate-600" />
              </div>
              <h3 className="mt-5 text-base font-bold text-white">{s.title}</h3>
              <p className={cn("mt-1 font-mono text-[11px]", s.tone)}>{s.fn}</p>
              <p className="mt-3 text-[13px] leading-relaxed text-slate-400">{s.copy}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Contracts ────────────────────────────────────────────────── */}
      <section id="contracts" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
        <div className="grid items-end gap-6 lg:grid-cols-[1fr_auto]">
          <motion.div {...reveal}>
            <Eyebrow>Protocol surface</Eyebrow>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Three contracts. One audit trail.
            </h2>
          </motion.div>
          <motion.p {...reveal} className="max-w-sm text-[13px] leading-relaxed text-slate-500">
            Every lifecycle event - mint, underwrite, stream, settle - emits an
            indexed event the in-app audit log renders as an explorer-linked
            timeline.
          </motion.p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {CONTRACTS_GRID.map((c, i) => (
            <motion.div
              key={c.name}
              {...reveal}
              transition={{ ...reveal.transition, delay: i * 0.06 }}
              className="glass glass-hover min-w-0 p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-sm font-semibold text-electric">{c.name}</p>
                <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-slate-400">
                  {c.chip}
                </span>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-slate-400">{c.copy}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Trust ────────────────────────────────────────────────────── */}
      <section id="trust" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20">
        <div className="grid gap-5 md:grid-cols-3">
          {TRUST.map((t, i) => (
            <motion.div
              key={t.title}
              {...reveal}
              transition={{ ...reveal.transition, delay: i * 0.07 }}
              className="glass min-w-0 p-6"
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck size={15} className="text-emeraldx-soft" />
                <h3 className="text-sm font-bold text-white">{t.title}</h3>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-slate-400">{t.copy}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <motion.div {...reveal} className="glass px-6 py-16 text-center">
          <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            The gap between invoice and cash{" "}
            <span className="text-gradient">closes fast.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm text-slate-400">
            Connect a BOTChain wallet and run the whole lifecycle - mint,
            underwrite, stream, settle - on mainnet.
          </p>
          <button type="button" onClick={onLaunch} className="btn-primary mt-8">
            Launch app
          </button>
        </motion.div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04]">
                <BrandMark size={18} />
              </span>
              <span className="text-sm font-extrabold tracking-tight text-white">SYNTURA</span>
            </div>
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-slate-500">
              AI-underwritten RWA invoices on BOTChain. Tokenize, price, stream,
              settle - with every decision auditable.
            </p>
            <div className="mt-5 flex items-center gap-2.5">
              <a
                href={X_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Syntura on X"
                title="Syntura on X"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-400 transition-colors hover:border-electric/40 hover:text-white"
              >
                <XLogo size={13} />
              </a>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Syntura on GitHub"
                title="Syntura on GitHub"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-400 transition-colors hover:border-electric/40 hover:text-white"
              >
                <Github size={15} />
              </a>
            </div>
          </div>
          {[
            {
              head: "Product",
              links: [
                ["Dashboard", () => goto("dashboard")],
                ["Mint invoice", () => goto("mint")],
                ["AI underwriter", () => goto("underwriter")],
                ["Liquidity vaults", () => goto("vaults")],
                ["Audit log", () => goto("audit")],
              ],
            },
            {
              head: "Ecosystem",
              links: [
                ["BOTChain explorer", BOTCHAIN.explorerUrl],
                ["ChainList · 677", "https://chainlist.org/chain/677"],
                ["RPC endpoint", BOTCHAIN.rpcUrl],
              ],
            },
            {
              head: "Resources",
              links: [
                ["Documentation", () => goto("docs")],
                ["GitHub", GITHUB_URL],
                ["Apache-2.0 license", `${GITHUB_URL}/blob/main/LICENSE`],
                ["README", `${GITHUB_URL}#readme`],
              ],
            },
          ].map((col) => (
            <div key={col.head} className="min-w-0">
              <Eyebrow>{col.head}</Eyebrow>
              <ul className="mt-4 space-y-2.5">
                {col.links.map(([label, target]) => (
                  <li key={label}>
                    {typeof target === "function" ? (
                      <button
                        type="button"
                        onClick={target}
                        className="text-[13px] text-slate-500 transition-colors hover:text-white"
                      >
                        {label}
                      </button>
                    ) : (
                      <a
                        href={target}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[13px] text-slate-500 transition-colors hover:text-white"
                      >
                        {label} <ExternalLink size={11} />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
