import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FilePlus2,
  BrainCircuit,
  Waves,
  CheckCircle2,
  PiggyBank,
  ArrowDownToLine,
  ScrollText,
  Radio,
  Globe,
} from "lucide-react";
import { useSyntura } from "../context/SynturaStore.jsx";
import { GlassCard, SectionTitle, TxLink, EmptyState } from "../components/ui/Glass.jsx";
import { cn, formatDate, formatTime } from "../lib/utils.js";
import { BOTCHAIN } from "../lib/chain.js";

/** Visual identity per onchain event type - icon + color family. */
const EVENT_TYPES = {
  MINT: {
    label: "Mint",
    icon: FilePlus2,
    node: "bg-electric/15 text-electric-soft border-electric/40",
    pill: "border-electric/50 bg-electric/15 text-electric-soft",
    glow: "shadow-glow-blue",
    bar: "bg-electric",
  },
  AI_UNDERWRITE: {
    label: "AI Underwrite",
    icon: BrainCircuit,
    node: "bg-violetx/15 text-violetx-soft border-violetx/40",
    pill: "border-violetx/50 bg-violetx/15 text-violetx-soft",
    glow: "shadow-glow-violet",
    bar: "bg-violetx",
  },
  STREAM: {
    label: "Stream",
    icon: Waves,
    node: "bg-cyan-500/15 text-cyan-300 border-cyan-500/40",
    pill: "border-cyan-500/50 bg-cyan-500/15 text-cyan-300",
    glow: "",
    bar: "bg-cyan-400",
  },
  SETTLEMENT: {
    label: "Settlement",
    icon: CheckCircle2,
    node: "bg-emeraldx/15 text-emeraldx-soft border-emeraldx/40",
    pill: "border-emeraldx/50 bg-emeraldx/15 text-emeraldx-soft",
    glow: "shadow-glow-emerald",
    bar: "bg-emeraldx",
  },
  DEPOSIT: {
    label: "Deposit",
    icon: PiggyBank,
    node: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    pill: "border-amber-500/50 bg-amber-500/15 text-amber-300",
    glow: "",
    bar: "bg-amber-400",
  },
  WITHDRAW: {
    label: "Withdraw",
    icon: ArrowDownToLine,
    node: "bg-rose-500/15 text-rose-300 border-rose-500/40",
    pill: "border-rose-500/50 bg-rose-500/15 text-rose-300",
    glow: "",
    bar: "bg-rose-400",
  },
};

const FILTERS = ["ALL", ...Object.keys(EVENT_TYPES)];

function FilterPill({ value, active, count, onClick }) {
  const meta = EVENT_TYPES[value];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200",
        active
          ? meta
            ? cn(meta.pill, meta.glow)
            : "border-electric/50 bg-electric/15 text-white shadow-glow-blue"
          : "border-slate-700/60 bg-panel/30 text-slate-400 hover:border-slate-500/60 hover:text-slate-200"
      )}
    >
      {meta ? meta.label : "All Events"}
      <span
        className={cn(
          "rounded-full px-1.5 py-px font-mono text-[10px]",
          active ? "bg-white/10 text-inherit" : "bg-slate-800/80 text-slate-500"
        )}
      >
        {count}
      </span>
    </button>
  );
}

function TimelineEvent({ evt, index, isLast }) {
  const meta = EVENT_TYPES[evt.type] || EVENT_TYPES.MINT;
  const Icon = meta.icon;
  return (
    <motion.li
      layout
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10, transition: { duration: 0.18 } }}
      transition={{ delay: Math.min(index * 0.06, 0.55), duration: 0.35, ease: "easeOut" }}
      className="relative flex gap-4 pl-1 sm:gap-5"
    >
      {/* Node + connector */}
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border backdrop-blur-sm",
            meta.node
          )}
        >
          <Icon size={19} />
        </div>
        {!isLast && (
          <div className="mt-1 w-px flex-1 bg-gradient-to-b from-slate-700/70 to-slate-800/20" />
        )}
      </div>

      {/* Event card */}
      <div className={cn("min-w-0 flex-1", !isLast && "pb-6")}>
        <div className="glass glass-hover relative overflow-hidden p-4 sm:p-5">
          <div className={cn("absolute inset-y-0 left-0 w-0.5 opacity-70", meta.bar)} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                meta.pill
              )}
            >
              {meta.label}
            </span>
            <span className="font-mono text-[11px] text-slate-500">
              {formatDate(evt.ts, { utc: true })} · {formatTime(evt.ts, { utc: true })} UTC
            </span>
          </div>
          <p className="mt-2.5 text-sm font-semibold leading-snug text-white">
            {evt.label}
          </p>
          {evt.detail && (
            <p className="mt-1 font-mono text-xs leading-relaxed text-slate-400">
              {evt.detail}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/70 pt-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Transaction
            </span>
            <TxLink hash={evt.txHash} />
          </div>
        </div>
      </div>
    </motion.li>
  );
}

/**
 * Onchain Execution Explorer - filterable, color-coded timeline of every
 * protocol event (mints, AI underwrites, streams, settlements, vault flows),
 * each deep-linked to the BOTChain explorer.
 */
export default function AuditLog() {
  const { auditLog } = useSyntura();
  const [filter, setFilter] = useState("ALL");

  const sorted = useMemo(
    () => [...auditLog].sort((a, b) => new Date(b.ts) - new Date(a.ts)),
    [auditLog]
  );

  const counts = useMemo(() => {
    const c = { ALL: sorted.length };
    for (const key of Object.keys(EVENT_TYPES)) c[key] = 0;
    for (const evt of sorted) c[evt.type] = (c[evt.type] || 0) + 1;
    return c;
  }, [sorted]);

  const visible = useMemo(
    () => (filter === "ALL" ? sorted : sorted.filter((e) => e.type === filter)),
    [sorted, filter]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="mx-auto max-w-4xl space-y-6"
    >
      <SectionTitle
        title="Onchain Execution Explorer"
        subtitle="Every protocol action - mint, AI underwrite, stream, settlement and vault flow - recorded as a verifiable BOTChain transaction."
        action={
          <span className="flex items-center gap-2 rounded-full border border-emeraldx/40 bg-emeraldx/10 px-3 py-1.5 text-xs font-semibold text-emeraldx-soft">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emeraldx opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emeraldx" />
            </span>
            Live Feed
          </span>
        }
      />

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <FilterPill
            key={f}
            value={f}
            active={filter === f}
            count={counts[f] || 0}
            onClick={() => setFilter(f)}
          />
        ))}
      </div>

      {/* Timeline */}
      <GlassCard className="p-4 sm:p-6">
        {visible.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={`No ${EVENT_TYPES[filter]?.label ?? ""} events yet`}
            subtitle="Events appear here in real time as the protocol executes on BOTChain."
          />
        ) : (
          <ol className="relative">
            <AnimatePresence mode="popLayout" initial={false}>
              {visible.map((evt, index) => (
                <TimelineEvent
                  key={evt.id}
                  evt={evt}
                  index={index}
                  isLast={index === visible.length - 1}
                />
              ))}
            </AnimatePresence>
          </ol>
        )}
      </GlassCard>

      {/* Explorer footnote */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/70 bg-panel/20 px-4 py-3">
        <span className="flex items-center gap-2 text-xs text-slate-500">
          <Globe size={14} className="shrink-0 text-slate-600" />
          All transactions verifiable on the {BOTCHAIN.name} explorer
        </span>
        <a
          href={BOTCHAIN.explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 font-mono text-xs text-electric-soft transition-colors hover:text-white"
        >
          <Radio size={12} />
          {BOTCHAIN.explorerUrl}
        </a>
      </div>
    </motion.div>
  );
}
