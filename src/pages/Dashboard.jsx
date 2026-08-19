import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  FileStack,
  Waves,
  ShieldCheck,
  TrendingUp,
  Play,
  CheckCircle2,
  Loader2,
  ReceiptText,
} from "lucide-react";
import { useSyntura } from "../context/SynturaStore.jsx";
import {
  GlassCard,
  StatCard,
  Badge,
  SectionTitle,
  TxLink,
  ProgressBar,
  EmptyState,
} from "../components/ui/Glass.jsx";
import {
  cn,
  formatUSD,
  formatPercent,
  bpsToPercent,
  formatDate,
  daysUntil,
} from "../lib/utils.js";
import { classifyRisk } from "../agent/aiSentryAgent.js";

/** #SYNV-007 style token id. */
function invoiceTag(id) {
  return `#SYNV-${String(id).padStart(3, "0")}`;
}

function DueDateCell({ dueDate }) {
  const days = daysUntil(dueDate);
  const overdue = days < 0;
  return (
    <div>
      <p className="text-sm text-slate-200">{formatDate(dueDate)}</p>
      <p
        className={cn(
          "mt-0.5 text-xs",
          overdue ? "font-semibold text-rose-400" : "text-slate-500"
        )}
      >
        {overdue ? `${Math.abs(days)}d overdue` : `in ${days}d`}
      </p>
    </div>
  );
}

function riskTextColor(score) {
  if (score >= 80) return "text-emeraldx-soft";
  if (score >= 60) return "text-amber-300";
  return "text-rose-400";
}

/**
 * Per-row async action: Start Stream (Underwritten), Settle (Streaming), or -
 * for Pending rows - a queued-for-the-sentry indicator. The Underwrite button
 * only appears for a registry-verified sentry wallet; everyone else waits for
 * the autonomous service.
 */
function RowAction({ invoice, busy, isSentry, onAct }) {
  if (invoice.status === "Underwritten") {
    return (
      <button
        onClick={() => onAct(invoice)}
        disabled={busy}
        className="btn-primary min-w-[128px] !px-3.5 !py-1.5 !text-xs"
      >
        {busy ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Streaming…
          </>
        ) : (
          <>
            <Play size={14} />
            Start Stream
          </>
        )}
      </button>
    );
  }
  if (invoice.status === "Streaming") {
    return (
      <button
        onClick={() => onAct(invoice)}
        disabled={busy}
        className="inline-flex min-w-[128px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emeraldx to-electric px-3.5 py-1.5 text-xs font-semibold text-white shadow-glow-emerald transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
      >
        {busy ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Settling…
          </>
        ) : (
          <>
            <CheckCircle2 size={14} />
            Settle
          </>
        )}
      </button>
    );
  }
  if (invoice.status === "Settled") {
    return (
      <span className="inline-flex min-w-[128px] items-center justify-center gap-1.5 text-xs font-medium text-slate-500">
        <CheckCircle2 size={14} className="text-emeraldx-soft" />
        Complete
      </span>
    );
  }
  return (
    <div className="inline-flex min-w-[128px] items-center justify-end gap-3">
      <span
        title="Queued for the autonomous sentry - an independent service underwrites it onchain"
        className="inline-flex cursor-help items-center gap-2 text-xs font-medium text-slate-500"
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-electric-soft opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-electric-soft" />
        </span>
        Awaiting AI
      </span>
      {isSentry && (
        <button
          onClick={() => onAct(invoice)}
          disabled={busy}
          className="btn-ghost !px-3 !py-1.5 !text-[10px]"
          title="Underwrite from the connected sentry wallet"
        >
          {busy ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              Underwriting…
            </>
          ) : (
            <>
              <ShieldCheck size={13} />
              Underwrite
            </>
          )}
        </button>
      )}
    </div>
  );
}

export default function Dashboard() {
  const {
    invoices,
    vault,
    startStream,
    settleInvoice,
    underwriteAsSentry,
    isSentry,
  } = useSyntura();
  const [pendingIds, setPendingIds] = useState(() => new Set());

  const stats = useMemo(() => {
    const audited = invoices.filter((i) => i.riskScore > 0).length;
    const totalFaceValue = invoices.reduce((sum, i) => sum + i.faceValueUSD, 0);
    return { audited, totalFaceValue };
  }, [invoices]);

  const { supplierPct, poolPct, treasuryPct } = vault.feeSplit;

  const handleAction = async (invoice) => {
    setPendingIds((prev) => new Set(prev).add(invoice.id));
    try {
      if (invoice.status === "Underwritten") await startStream(invoice.id);
      else if (invoice.status === "Streaming") await settleInvoice(invoice.id);
      else if (invoice.status === "Pending") await underwriteAsSentry(invoice.id);
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(invoice.id);
        return next;
      });
    }
  };

  const splitSegments = [
    {
      key: "supplier",
      pct: supplierPct,
      title: "Supplier Payout",
      note: "Instant working capital streamed to the invoice originator.",
      bar: "bg-gradient-to-r from-electric-deep to-electric-soft",
      dot: "bg-electric-soft",
    },
    {
      key: "pool",
      pct: poolPct,
      title: "Liquidity Pool",
      note: "Yield distributed pro-rata to vault liquidity providers.",
      bar: "bg-gradient-to-r from-violetx to-violetx-soft",
      dot: "bg-violetx-soft",
    },
    {
      key: "treasury",
      pct: treasuryPct,
      title: "Protocol Treasury",
      note: "Funds AI Sentry ops, audits and protocol growth.",
      bar: "bg-gradient-to-r from-emeraldx to-emeraldx-soft",
      dot: "bg-emeraldx-soft",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="space-y-6"
    >
      {/* ── Hero strip ─────────────────────────────────────────────── */}
      <GlassCard className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-electric/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-violetx/15 blur-3xl" />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-white sm:text-4xl">
              Autonomous AI RWA{" "}
              <span className="text-gradient">Invoice Protocol</span>
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400 sm:text-base">
              Tokenize real-world invoices as NFTs, let the AI Risk Sentry
              underwrite them in seconds, and stream liquidity to suppliers in
              real time - every settlement split{" "}
              <span className="font-semibold text-slate-200">
                {supplierPct}/{poolPct}/{treasuryPct}
              </span>{" "}
              atomically onchain.
            </p>
          </div>
          <div className="glass-inset shrink-0 p-5 lg:w-72">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Face Value Tokenized
            </p>
            <p className="mt-2 text-3xl font-extrabold tracking-tight text-white">
              {formatUSD(stats.totalFaceValue)}
            </p>
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-slate-400">Pool utilization</span>
                <span className="font-semibold text-electric-soft">
                  {formatPercent(vault.poolUtilizationPct, 1)}
                </span>
              </div>
              <ProgressBar value={vault.poolUtilizationPct} accent="electric" />
            </div>
          </div>
        </div>
      </GlassCard>

      {/* ── Protocol stats ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={FileStack}
          label="Total Invoices Tokenized"
          value={invoices.length}
          accent="electric"
          index={0}
        />
        <StatCard
          icon={Waves}
          label="Total Streaming Liquidity"
          value={formatUSD(vault.activeStreamsUSD)}
          accent="violet"
          index={1}
        />
        <StatCard
          icon={ShieldCheck}
          label="AI Risk Audits Passed"
          value={stats.audited}
          accent="emerald"
          index={2}
        />
        <StatCard
          icon={TrendingUp}
          label="Pool Return · Lifetime"
          value={formatPercent(vault.averageYieldAPY)}
          accent="amber"
          index={3}
        />
      </div>

      {/* ── 90/7/3 settlement fee split ────────────────────────────── */}
      <GlassCard>
        <SectionTitle
          title="Settlement Fee Split"
          subtitle="Every settled invoice executes an atomic onchain distribution - enforced by SynturaVault in basis points."
          action={
            <span className="font-mono text-xs text-slate-500">
              {supplierPct * 100} / {poolPct * 100} / {treasuryPct * 100} BPS
            </span>
          }
        />
        <div className="flex h-5 w-full overflow-hidden rounded-full bg-slate-800/80">
          {splitSegments.map((seg, i) => (
            <motion.div
              key={seg.key}
              initial={{ width: 0 }}
              animate={{ width: `${seg.pct}%` }}
              transition={{ duration: 0.9, delay: 0.15 + i * 0.15, ease: "easeOut" }}
              className={cn("h-full", seg.bar)}
              title={`${seg.title} - ${seg.pct}%`}
            />
          ))}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {splitSegments.map((seg, i) => (
            <motion.div
              key={seg.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1, duration: 0.4 }}
              className="glass-inset p-4"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <span className={cn("h-2.5 w-2.5 rounded-full", seg.dot)} />
                  {seg.title}
                </span>
                <span className="text-lg font-extrabold text-white">
                  {seg.pct}%
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                {seg.note}
              </p>
            </motion.div>
          ))}
        </div>
      </GlassCard>

      {/* ── Invoice book ───────────────────────────────────────────── */}
      <GlassCard className="!p-0">
        <div className="px-6 pt-6">
          <SectionTitle
            title="RWA Invoice Book"
            subtitle="Every tokenized invoice, its AI underwriting verdict and live stream state."
            action={
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/70 bg-panel/40 px-3 py-1 text-xs font-semibold text-slate-300">
                <ReceiptText size={13} className="text-electric-soft" />
                {invoices.length} onchain
              </span>
            }
          />
        </div>
        {invoices.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="No invoices tokenized yet"
            subtitle="Mint your first RWA invoice NFT to populate the book."
          />
        ) : (
          <div className="scrollbar-thin overflow-x-auto pb-2">
            <table className="w-full min-w-[1040px] text-left">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-6 py-3">Invoice</th>
                  <th className="px-4 py-3">Debtor / Supplier</th>
                  <th className="px-4 py-3">Face Value</th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3">AI Risk</th>
                  <th className="px-4 py-3">Discount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Tx Proof</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => {
                  const tier = classifyRisk(inv.riskScore);
                  const busy = pendingIds.has(inv.id);
                  return (
                    <motion.tr
                      key={inv.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 + i * 0.05, duration: 0.35 }}
                      className="border-b border-slate-800/60 transition-colors last:border-0 hover:bg-electric/[0.04]"
                    >
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm font-semibold text-white">
                          {invoiceTag(inv.id)}
                        </span>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Minted {formatDate(inv.mintedAt)}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-semibold text-slate-100">
                          {inv.debtorName}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {inv.supplierName}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-sm font-semibold text-white">
                          {formatUSD(inv.faceValueUSD)}
                        </span>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {inv.termDays}d term · {inv.sector}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <DueDateCell dueDate={inv.dueDate} />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              "text-sm font-bold",
                              riskTextColor(inv.riskScore)
                            )}
                          >
                            {inv.riskScore}
                            <span className="text-xs font-medium text-slate-500">
                              /100
                            </span>
                          </span>
                          <Badge status={tier} />
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-mono text-sm text-slate-200">
                          {bpsToPercent(inv.discountRateBps)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <Badge status={inv.status} />
                        {inv.status === "Streaming" && (
                          <div className="mt-2 w-32">
                            <ProgressBar value={inv.streamedPct} accent="violet" />
                            <p className="mt-1 text-[10px] font-semibold text-violetx-soft">
                              {inv.streamedPct}% streamed
                            </p>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <TxLink hash={inv.txHash} />
                      </td>
                      <td className="px-6 py-4 text-right">
                        <RowAction
                          invoice={inv}
                          busy={busy}
                          isSentry={isSentry}
                          onAct={handleAction}
                        />
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}
