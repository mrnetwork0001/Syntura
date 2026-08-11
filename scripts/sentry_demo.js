/**
 * Syntura AI Risk Sentry — CLI demonstration.
 * Underwrites four sample invoices with deliberately varied risk profiles and
 * renders the results as an ANSI table with per-invoice factor breakdowns.
 *
 *   node scripts/sentry_demo.js
 */

import {
  underwriteInvoice,
  classifyRisk,
  SENTRY_MODEL_ID,
} from "../src/agent/aiSentryAgent.js";

/* ── ANSI helpers (honors NO_COLOR) ─────────────────────────────────────── */

const COLOR = !process.env.NO_COLOR;
const esc = (code) => (s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const bold = esc("1");
const dim = esc("2");
const red = esc("31");
const green = esc("32");
const yellow = esc("33");
const blue = esc("34");
const magenta = esc("35");
const cyan = esc("36");
const gray = esc("90");

const stripAnsi = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, "");
const width = (s) => stripAnsi(s).length;
const padEnd = (s, n) => s + " ".repeat(Math.max(0, n - width(s)));
const padStart = (s, n) => " ".repeat(Math.max(0, n - width(s))) + s;

const tierColor = (tier) =>
  tier === "Low" ? green : tier === "Medium" ? yellow : red;
const scoreColor = (score) =>
  score >= 80 ? green : score >= 60 ? yellow : red;

const usd = (v) =>
  "$" + Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const isoDaysFromNow = (n) =>
  new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/* ── Sample book: blue-chip → mid-market → thin-file → fraud-flagged ────── */

const SAMPLE_INVOICES = [
  {
    label: "SYNV-101",
    debtorName: "Safaricom PLC",
    supplierName: "Nairobi DevWorks",
    faceValueUSD: 48500,
    termDays: 30,
    dueDate: isoDaysFromNow(30),
    sector: "Software Services",
    debtorYearsTrading: 24,
    priorInvoicesPaid: 18,
    priorInvoicesDefaulted: 0,
  },
  {
    label: "SYNV-102",
    debtorName: "Netcare Group",
    supplierName: "Cape Town MedSupply",
    faceValueUSD: 212400,
    termDays: 90,
    dueDate: isoDaysFromNow(90),
    sector: "Healthcare Supply",
    debtorYearsTrading: 30,
    priorInvoicesPaid: 9,
    priorInvoicesDefaulted: 0,
  },
  {
    label: "SYNV-103",
    debtorName: "Sahel Construction Group",
    supplierName: "Bamako Steelworks",
    faceValueUSD: 145000,
    termDays: 90,
    dueDate: isoDaysFromNow(90),
    sector: "Construction",
    debtorYearsTrading: 6,
    priorInvoicesPaid: 4,
    priorInvoicesDefaulted: 1,
  },
  {
    label: "SYNV-104",
    debtorName: "QuickCash Forex Ltd",
    supplierName: "Freeport Traders",
    faceValueUSD: 250000,
    termDays: 120,
    dueDate: isoDaysFromNow(45), // deliberately misaligned with the 120d term
    sector: "Other",
    debtorYearsTrading: 1,
    priorInvoicesPaid: 0,
    priorInvoicesDefaulted: 1,
  },
];

/* ── Table rendering ────────────────────────────────────────────────────── */

function renderTable(rows) {
  const header = [
    "Invoice", "Debtor", "Face Value", "Term", "Risk", "Tier",
    "Fraud", "Discount", "Advance", "LP APY",
  ];
  const body = rows.map(({ inv, r }) => [
    cyan(inv.label),
    inv.debtorName,
    usd(inv.faceValueUSD),
    `${inv.termDays}d`,
    scoreColor(r.riskScore)(`${r.riskScore}/100`),
    tierColor(r.tier)(r.tier),
    `${r.fraudProbability.toFixed(1)}%`,
    `${(r.discountRateBps / 100).toFixed(2)}%`,
    `${r.advanceRatePct}%`,
    `${r.expectedYieldAPY.toFixed(2)}%`,
  ]);

  const cols = header.map((h, i) =>
    Math.max(width(h), ...body.map((row) => width(row[i])))
  );
  const RIGHT_ALIGNED = new Set([2, 3, 4, 6, 7, 8, 9]);
  const line = (l, m, r2) =>
    gray(l + cols.map((c) => "─".repeat(c + 2)).join(m) + r2);
  const renderRow = (cells, style = (s) => s) =>
    gray("│") +
    cells
      .map((c, i) => {
        const cell = RIGHT_ALIGNED.has(i)
          ? padStart(style(c), cols[i])
          : padEnd(style(c), cols[i]);
        return ` ${cell} `;
      })
      .join(gray("│")) +
    gray("│");

  console.log(line("┌", "┬", "┐"));
  console.log(renderRow(header, (s) => bold(s)));
  console.log(line("├", "┼", "┤"));
  for (const row of body) console.log(renderRow(row));
  console.log(line("└", "┴", "┘"));
}

function meterBar(score, impact) {
  const filled = Math.round((score / 100) * 24);
  const bar = "█".repeat(filled) + "░".repeat(24 - filled);
  const paint =
    impact === "positive" ? green : impact === "negative" ? red : yellow;
  return paint(bar);
}

function renderBreakdown(inv, r) {
  const title = ` ${inv.label} · ${inv.debtorName} ← ${inv.supplierName} `;
  console.log(
    "\n" + gray("┌─") + bold(magenta(title)) +
    gray("─".repeat(Math.max(0, 75 - width(title)))) + gray("┐")
  );
  for (const f of r.factors) {
    const label = padEnd(f.label, 22);
    const scoreStr = padStart(`${f.score}`, 5);
    const weightStr = dim(`w=${f.weight.toFixed(2)}`);
    console.log(
      `  ${label} ${meterBar(f.score, f.impact)} ${scoreColor(f.score)(scoreStr)} ${weightStr}`
    );
    console.log(`  ${" ".repeat(22)} ${dim("↳ " + f.note)}`);
  }
  console.log(gray("  " + "─".repeat(74)));
  for (const line of r.rationale) console.log(dim(`  ▸ ${line}`));
  console.log(`  ${blue("audit commitment")} ${cyan(r.auditHash)}`);
  console.log(gray("└" + "─".repeat(76) + "┘"));
}

/* ── Run ────────────────────────────────────────────────────────────────── */

console.log("");
console.log(bold(blue("  ⬡ SYNTURA")) + dim(" — AI Risk Sentry · deterministic underwriting demo"));
console.log(dim(`  model ${SENTRY_MODEL_ID} · zero-dependency ESM · browser + Node`));
console.log("");

const results = SAMPLE_INVOICES.map((inv) => ({ inv, r: underwriteInvoice(inv) }));

renderTable(results);

for (const { inv, r } of results) renderBreakdown(inv, r);

/* Summary + determinism proof */
const totalFace = results.reduce((a, { inv }) => a + inv.faceValueUSD, 0);
const avgRisk = Math.round(
  results.reduce((a, { r }) => a + r.riskScore, 0) / results.length
);
const tiers = results.reduce((acc, { r }) => {
  acc[r.tier] = (acc[r.tier] || 0) + 1;
  return acc;
}, {});
const tierSummary = ["Low", "Medium", "High"]
  .filter((t) => tiers[t])
  .map((t) => tierColor(t)(`${tiers[t]} ${t}`))
  .join(dim(" · "));

const replay = underwriteInvoice(SAMPLE_INVOICES[0]);
const deterministic = replay.auditHash === results[0].r.auditHash;

console.log("");
console.log(
  `  ${bold("Book summary")}  ${usd(totalFace)} face value · avg risk ` +
  scoreColor(avgRisk)(`${avgRisk}/100`) + ` (${classifyRisk(avgRisk)} tier avg) · ${tierSummary}`
);
console.log(
  `  ${bold("Determinism")}   replayed ${results[0].inv.label} → identical auditHash: ` +
  (deterministic ? green("VERIFIED ✓") : red("MISMATCH ✗"))
);
console.log(
  dim("  Commitments are ready to anchor on BOTChain via SynturaSentryRegistry.commitRiskScore().")
);
console.log("");

if (!deterministic) process.exitCode = 1;
