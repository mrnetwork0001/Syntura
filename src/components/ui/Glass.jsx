import React from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, ExternalLink } from "lucide-react";
import { cn, shortHash } from "../../lib/utils.js";
import { explorerTxUrl } from "../../lib/chain.js";

/** Frosted panel - the base building block of every screen. */
export function GlassCard({ className, children, hover = false, ...props }) {
  return (
    <div className={cn("glass p-6", hover && "glass-hover", className)} {...props}>
      {children}
    </div>
  );
}

/** Animated stat card with icon, value, label and optional delta. */
export function StatCard({ icon: Icon, label, value, delta, accent = "electric", index = 0 }) {
  const accents = {
    electric: "text-electric bg-white/[0.04] border-white/10",
    emerald: "text-emeraldx-soft bg-white/[0.04] border-white/10",
    violet: "text-violetx-soft bg-white/[0.04] border-white/10",
    amber: "text-amber-400 bg-white/[0.04] border-white/10",
  };
  const positive = typeof delta === "number" ? delta >= 0 : null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.4 }}
      className="glass glass-hover p-5"
    >
      <div className="flex items-start justify-between">
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl border",
            accents[accent] || accents.electric
          )}
        >
          {Icon && <Icon size={20} />}
        </div>
        {positive !== null && (
          <span
            className={cn(
              "flex items-center gap-1 text-xs font-semibold",
              positive ? "text-emeraldx-soft" : "text-rose-400"
            )}
          >
            {positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <p className="mt-4 font-mono text-2xl font-bold tracking-tight text-white">{value}</p>
      <p className="mt-1 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
    </motion.div>
  );
}

/** Status pill: Pending | Underwritten | Streaming | Settled (+ generic tones). */
export function Badge({ status, className }) {
  const tones = {
    Pending: "bg-slate-500/15 text-slate-300 border-slate-500/40",
    Underwritten: "bg-electric/15 text-electric-soft border-electric/40",
    Streaming: "bg-violetx/15 text-violetx-soft border-violetx/40",
    Settled: "bg-emeraldx/15 text-emeraldx-soft border-emeraldx/40",
    Low: "bg-emeraldx/15 text-emeraldx-soft border-emeraldx/40",
    Medium: "bg-amber-500/15 text-amber-300 border-amber-500/40",
    High: "bg-rose-500/15 text-rose-300 border-rose-500/40",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
        tones[status] || tones.Pending,
        className
      )}
    >
      {status === "Streaming" && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violetx-soft" />
      )}
      {status}
    </span>
  );
}

/** Section heading with optional action slot on the right. */
export function SectionTitle({ title, subtitle, action, className }) {
  return (
    <div className={cn("mb-5 flex flex-wrap items-end justify-between gap-3", className)}>
      <div>
        <h2 className="text-xl font-bold tracking-tight text-white">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Monospace tx-hash chip that deep-links to the BOTChain explorer. */
export function TxLink({ hash, className }) {
  if (!hash) return <span className="text-slate-500">-</span>;
  return (
    <a
      href={explorerTxUrl(hash)}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-1 font-mono text-xs text-electric-soft transition-colors hover:text-white",
        className
      )}
    >
      {shortHash(hash)}
      <ExternalLink size={12} />
    </a>
  );
}

/** Slim horizontal progress bar (0-100). */
export function ProgressBar({ value, accent = "violet", className }) {
  const fills = {
    violet: "from-violetx to-electric",
    emerald: "from-emeraldx to-electric",
    electric: "from-electric-deep to-electric-soft",
  };
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-800", className)}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className={cn("h-full rounded-full bg-gradient-to-r", fills[accent] || fills.violet)}
      />
    </div>
  );
}

/** Circular 0-100 gauge for AI risk scores. */
export function RiskGauge({ score, size = 148, label = "AI Risk Score" }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(100, Math.max(0, score ?? 0));
  const color = pct >= 80 ? "#10b981" : pct >= 60 ? "#f59e0b" : "#f43f5e";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(30,41,59,0.9)"
          strokeWidth="10"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - pct / 100) }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          style={{ filter: `drop-shadow(0 0 8px ${color}66)` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-extrabold text-white">{Math.round(pct)}</span>
        <span className="mt-0.5 max-w-[90px] text-center font-mono text-[9px] font-semibold uppercase tracking-widest text-slate-500">
          {label}
        </span>
      </div>
    </div>
  );
}

/** Empty-state placeholder. */
export function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      {Icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700/60 bg-panel/40 text-slate-500">
          <Icon size={24} />
        </div>
      )}
      <p className="text-sm font-semibold text-slate-300">{title}</p>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
    </div>
  );
}
