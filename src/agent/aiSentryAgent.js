/**
 * Syntura AI Risk Sentry - deterministic, explainable invoice underwriting.
 *
 * Pure ESM, zero dependencies, runs unchanged in the browser and in Node.
 * Identical payloads always produce identical results: all "noise" is derived
 * from FNV-1a / xorshift hashes of the payload itself - never Math.random.
 * The auditHash is a 256-bit commitment over the normalized payload + scores,
 * suitable for onchain anchoring via SynturaSentryRegistry.commitRiskScore().
 */

export const SENTRY_MODEL_ID = "syntura-sentry-v1";

/* ────────────────────────────────────────────────────────────────────────────
 * Deterministic hashing primitives (FNV-1a 32-bit + xorshift32 avalanche)
 * ──────────────────────────────────────────────────────────────────────────── */

function fnv1a32(str, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function xorshift32(x) {
  x >>>= 0;
  x ^= (x << 13) >>> 0;
  x ^= x >>> 17;
  x ^= (x << 5) >>> 0;
  return x >>> 0;
}

/** Deterministic pseudo-uniform in [0, 1) derived from a string + salt. */
function hashUnit(str, salt) {
  return xorshift32(xorshift32(fnv1a32(`${salt}::${str}`))) / 0x100000000;
}

/** 256-bit hex commitment: 8 chained 32-bit lanes over the canonical string. */
function commitmentHash(canonical) {
  const LANE_SEEDS = [
    0x811c9dc5, 0x9e3779b1, 0x85ebca6b, 0xc2b2ae35,
    0x27d4eb2f, 0x165667b1, 0xdeadbeef, 0xcafef00d,
  ];
  let carry = fnv1a32(canonical);
  let hex = "";
  for (let i = 0; i < 8; i++) {
    let w = fnv1a32(canonical, (LANE_SEEDS[i] ^ carry) >>> 0);
    w = xorshift32((w ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0);
    w = xorshift32(w);
    carry = w;
    hex += w.toString(16).padStart(8, "0");
  }
  return `0x${hex}`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Model tables
 * ──────────────────────────────────────────────────────────────────────────── */

// Baseline sector safety (0-100, higher = safer). Mirrors SECTORS in mockData.
const SECTOR_RISK_TABLE = {
  "Software Services": 90,
  "Healthcare Supply": 82,
  "Logistics & Freight": 78,
  "Manufacturing": 76,
  "Media & Design": 74,
  "Energy & Utilities": 72,
  "Agriculture & FMCG": 70,
  "Retail & E-Commerce": 66,
  "Construction": 58,
  "Other": 62,
};
const SECTOR_DEFAULT = 62;

// Corporate-form tokens in the debtor name that correlate with credit quality.
const POSITIVE_NAME_TOKENS = {
  plc: 14, bank: 9, group: 8, industries: 8, government: 8, holdings: 7,
  corporation: 6, corp: 6, university: 6, municipal: 6, limited: 5, ltd: 5,
  inc: 5, national: 4, international: 4,
};
const ADVERSE_NAME_TOKENS = {
  anonymous: 12, forex: 10, offshore: 10, shell: 10, cash: 8, crypto: 8,
  quick: 7, instant: 7, fx: 6,
};

// Invoice size safety curve over log10(USD): sweet spot ~$10k-$100k,
// dust-sized and concentration-sized invoices both score down.
const SIZE_CURVE = [
  [2, 40], [3, 62], [4, 80], [4.6, 86], [5, 84], [5.6, 68], [6, 55], [7, 35],
];

// Factor weights - must sum to 1.0 so the composite stays on a 0-100 scale.
const WEIGHTS = {
  debtorCredit: 0.24,
  paymentHistory: 0.20,
  termRisk: 0.15,
  sectorRisk: 0.13,
  invoiceSize: 0.11,
  dueDateProximity: 0.09,
  fraudSignals: 0.08,
};

// Share of the gross annualized discount captured by liquidity providers
// after the supplier advance and the 3% treasury cut (7% pool slice of the
// 90/7/3 settlement split, levered by pool utilization).
const POOL_CAPTURE = 0.35;

/* ────────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────────── */

const clampNum = (v, min, max) => Math.min(max, Math.max(min, v));
const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;

function tokenizeName(name) {
  return name.toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

function interpolateCurve(curve, x) {
  if (x <= curve[0][0]) return curve[0][1];
  const last = curve[curve.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i - 1];
    const [x2, y2] = curve[i];
    if (x <= x2) return y1 + ((x - x1) / (x2 - x1)) * (y2 - y1);
  }
  return last[1];
}

function fmtUSD(v) {
  return `$${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function normalizePayload(payload = {}) {
  const debtorName =
    String(payload.debtorName ?? "").trim() || "Unknown Debtor";
  const supplierName =
    String(payload.supplierName ?? "").trim() || "Unknown Supplier";

  const fvRaw = Number(payload.faceValueUSD);
  const faceValueUSD = clampNum(
    Number.isFinite(fvRaw) && fvRaw > 0 ? fvRaw : 25000,
    100,
    50_000_000
  );

  const tdRaw = Number(payload.termDays);
  const termDays = Math.round(
    clampNum(Number.isFinite(tdRaw) && tdRaw > 0 ? tdRaw : 30, 1, 365)
  );

  const sector = String(payload.sector ?? "Other").trim() || "Other";

  // Quantize "now" to a UTC day so results are stable across a demo session;
  // callers may pin payload.asOf (ISO date) for fully reproducible runs.
  const asOfMs = Date.parse(payload.asOf ?? "");
  const asOf = Number.isFinite(asOfMs)
    ? new Date(asOfMs).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const dueMs = Date.parse(payload.dueDate ?? "");
  const dueDateValid = Number.isFinite(dueMs);
  const dueDate = dueDateValid
    ? new Date(dueMs).toISOString().slice(0, 10)
    : new Date(Date.parse(asOf) + termDays * 86400000)
        .toISOString()
        .slice(0, 10);

  const yrRaw = Number(payload.debtorYearsTrading);
  const debtorYearsTrading = clampNum(
    Number.isFinite(yrRaw) && yrRaw >= 0 ? yrRaw : 4,
    0,
    100
  );

  const paidRaw = Number(payload.priorInvoicesPaid);
  const priorInvoicesPaid = Math.round(
    clampNum(Number.isFinite(paidRaw) && paidRaw >= 0 ? paidRaw : 0, 0, 10000)
  );

  const defRaw = Number(payload.priorInvoicesDefaulted);
  const priorInvoicesDefaulted = Math.round(
    clampNum(Number.isFinite(defRaw) && defRaw >= 0 ? defRaw : 0, 0, 10000)
  );

  return {
    debtorName, supplierName, faceValueUSD, termDays, sector,
    dueDate, dueDateValid, asOf,
    debtorYearsTrading, priorInvoicesPaid, priorInvoicesDefaulted,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Public API
 * ──────────────────────────────────────────────────────────────────────────── */

/** Risk tier from a 0-100 risk score (higher = safer). */
export function classifyRisk(riskScore) {
  const s = Number(riskScore) || 0;
  if (s >= 80) return "Low";
  if (s >= 60) return "Medium";
  return "High";
}

/**
 * Underwrite a single invoice payload. Deterministic and fully explainable:
 * every factor lands in `factors` and `rationale`, and the exact inputs +
 * outputs are committed in `auditHash`.
 */
export function underwriteInvoice(payload) {
  const p = normalizePayload(payload);
  const factors = [];
  const rationale = [];

  rationale.push(
    `model ${SENTRY_MODEL_ID} · deterministic pass over ${Object.keys(WEIGHTS).length} weighted factors · as-of ${p.asOf}`
  );

  /* 1 ── Debtor credit profile: name-form heuristics + trading longevity */
  const tokens = tokenizeName(p.debtorName);
  let posSignal = 0;
  let negSignal = 0;
  const adverseHits = [];
  for (const t of tokens) {
    if (POSITIVE_NAME_TOKENS[t]) posSignal += POSITIVE_NAME_TOKENS[t];
    if (ADVERSE_NAME_TOKENS[t]) {
      negSignal += ADVERSE_NAME_TOKENS[t];
      adverseHits.push(t);
    }
  }
  posSignal = Math.min(22, posSignal);
  negSignal = Math.min(25, negSignal);
  const longevityBonus = Math.min(20, Math.log1p(p.debtorYearsTrading) * 7.2);
  const creditJitter = (hashUnit(p.debtorName, "credit") - 0.5) * 8;
  const creditScore = round1(
    clampNum(52 + posSignal - negSignal + longevityBonus + creditJitter, 8, 98)
  );
  factors.push({
    key: "debtorCredit",
    label: "Debtor Credit Profile",
    weight: WEIGHTS.debtorCredit,
    score: creditScore,
    impact: creditScore >= 72 ? "positive" : creditScore <= 48 ? "negative" : "neutral",
    note:
      `corporate-form signals +${posSignal}` +
      (negSignal > 0 ? ` / adverse tokens -${negSignal} (${adverseHits.join(", ")})` : "") +
      ` · ${p.debtorYearsTrading}y trading`,
  });
  rationale.push(
    `debtor "${p.debtorName}" credit ${creditScore}/100 - form signals +${posSignal}, adverse -${negSignal}, ${p.debtorYearsTrading}y trading`
  );

  /* 2 ── Repayment history: Laplace-smoothed ratio, volume-weighted */
  const paid = p.priorInvoicesPaid;
  const defaulted = p.priorInvoicesDefaulted;
  const historyTotal = paid + defaulted;
  let historyScore;
  let historyNote;
  if (historyTotal === 0) {
    historyScore = 55;
    historyNote = "no on-protocol repayment history - neutral prior applied";
  } else {
    const laplace = ((paid + 1) / (historyTotal + 2)) * 100;
    const confidence = historyTotal / (historyTotal + 4);
    const defaultPenalty = Math.min(28, defaulted * 11);
    historyScore = round1(
      clampNum(55 + (laplace - 55) * confidence - defaultPenalty, 4, 98)
    );
    historyNote = `${paid} paid / ${defaulted} defaulted on-protocol · confidence ${Math.round(confidence * 100)}%`;
  }
  factors.push({
    key: "paymentHistory",
    label: "Repayment History",
    weight: WEIGHTS.paymentHistory,
    score: historyScore,
    impact: historyScore >= 72 ? "positive" : historyScore <= 48 ? "negative" : "neutral",
    note: historyNote,
  });
  rationale.push(`repayment history ${historyScore}/100 - ${historyNote}`);

  /* 3 ── Payment-term risk curve: convex - each extra day costs more */
  const t = p.termDays;
  const termScore = round1(clampNum(100 - 0.32 * t - 0.0018 * t * t, 12, 96));
  factors.push({
    key: "termRisk",
    label: "Payment Term Curve",
    weight: WEIGHTS.termRisk,
    score: termScore,
    impact: termScore >= 72 ? "positive" : termScore <= 48 ? "negative" : "neutral",
    note: `${t}-day term on convex risk curve - longer terms compound exposure`,
  });
  rationale.push(`payment term ${t}d scores ${termScore}/100 on convex duration curve`);

  /* 4 ── Sector baseline from the risk table */
  const sectorScore = SECTOR_RISK_TABLE[p.sector] ?? SECTOR_DEFAULT;
  factors.push({
    key: "sectorRisk",
    label: "Sector Risk",
    weight: WEIGHTS.sectorRisk,
    score: sectorScore,
    impact: sectorScore >= 72 ? "positive" : sectorScore <= 48 ? "negative" : "neutral",
    note: `${p.sector} baseline from sector risk table`,
  });
  rationale.push(`sector "${p.sector}" baseline ${sectorScore}/100`);

  /* 5 ── Invoice size band on log scale */
  const logSize = Math.log10(p.faceValueUSD);
  const sizeScore = round1(clampNum(interpolateCurve(SIZE_CURVE, logSize), 5, 96));
  const sizeBandLabel =
    logSize < 3 ? "dust band" :
    logSize < 4 ? "micro band" :
    logSize < 5.15 ? "core band" :
    logSize < 6 ? "upper band - concentration watch" :
    "jumbo band - heavy concentration risk";
  factors.push({
    key: "invoiceSize",
    label: "Invoice Size Band",
    weight: WEIGHTS.invoiceSize,
    score: sizeScore,
    impact: sizeScore >= 72 ? "positive" : sizeScore <= 48 ? "negative" : "neutral",
    note: `${fmtUSD(p.faceValueUSD)} sits in ${sizeBandLabel}`,
  });
  rationale.push(`face value ${fmtUSD(p.faceValueUSD)} -> ${sizeBandLabel} (${sizeScore}/100)`);

  /* 6 ── Due-date proximity + term/due-date coherence */
  const daysToDue = Math.round(
    (Date.parse(p.dueDate) - Date.parse(p.asOf)) / 86400000
  );
  const misalign = Math.abs(daysToDue - p.termDays);
  let proximityScore;
  let proximityNote;
  if (!p.dueDateValid) {
    proximityScore = 35;
    proximityNote = "due date unparseable - substituted asOf + term and flagged";
  } else if (daysToDue < 0) {
    proximityScore = 12;
    proximityNote = `invoice already ${-daysToDue}d past due at underwriting`;
  } else if (daysToDue < 7) {
    proximityScore = 48;
    proximityNote = `due in ${daysToDue}d - minimal runway for streaming`;
  } else {
    const base = daysToDue <= 150 ? 88 : Math.max(50, 74 - (daysToDue - 150) * 0.1);
    const alignPenalty = misalign > 5 ? Math.min(35, misalign * 1.2) : 0;
    proximityScore = round1(clampNum(base - alignPenalty, 5, 96));
    proximityNote =
      alignPenalty > 0
        ? `due in ${daysToDue}d but term is ${p.termDays}d - ${misalign}d misalignment penalized`
        : `due in ${daysToDue}d, consistent with ${p.termDays}d term`;
  }
  factors.push({
    key: "dueDateProximity",
    label: "Due-Date Proximity",
    weight: WEIGHTS.dueDateProximity,
    score: proximityScore,
    impact: proximityScore >= 72 ? "positive" : proximityScore <= 48 ? "negative" : "neutral",
    note: proximityNote,
  });
  rationale.push(`due-date check ${proximityScore}/100 - ${proximityNote}`);

  /* 7 ── Fraud signal scan (also produces the standalone fraudProbability) */
  const signals = [];
  let fraud = 0.6 + hashUnit(`${p.debtorName}|${p.supplierName}|${p.faceValueUSD}`, "fraud") * 0.8;

  if (Number.isInteger(p.faceValueUSD) && p.faceValueUSD % 1000 === 0) {
    if (p.faceValueUSD % 10000 === 0) {
      fraud += 4.0;
      signals.push(`highly round face value (${fmtUSD(p.faceValueUSD)})`);
    } else {
      fraud += 1.4;
      signals.push(`round-figure face value (${fmtUSD(p.faceValueUSD)})`);
    }
  }
  if (p.dueDateValid && misalign > 10) {
    fraud += misalign > 30 ? 7.0 : 3.5;
    signals.push(`term/due-date mismatch of ${misalign}d`);
  }
  if (p.faceValueUSD > 100000 && historyTotal < 3) {
    fraud += 4.0;
    signals.push("six-figure invoice with <3 prior invoices on record");
  }
  if (p.debtorYearsTrading < 2 && p.faceValueUSD > 50000) {
    fraud += 3.0;
    signals.push(`debtor trading <2y for a ${fmtUSD(p.faceValueUSD)} invoice`);
  }
  if (defaulted > 0) {
    fraud += Math.min(7.5, defaulted * 2.5);
    signals.push(`${defaulted} prior default${defaulted > 1 ? "s" : ""} on record`);
  }
  if (adverseHits.length > 0) {
    fraud += Math.min(5.4, adverseHits.length * 1.8);
    signals.push(`adverse debtor-name tokens (${adverseHits.join(", ")})`);
  }
  if (p.faceValueUSD < 1000) {
    fraud += 1.5;
    signals.push("dust-sized invoice - spam/probe pattern");
  }
  if (p.dueDateValid && daysToDue < 0) {
    fraud += 2.5;
    signals.push("submitted after its own due date");
  }
  const fraudProbability = round1(clampNum(fraud, 0.1, 97));

  const fraudScore = round1(clampNum(100 - fraudProbability * 4, 2, 98));
  const fraudNote =
    signals.length > 0 ? signals.join("; ") : "no anomalies detected across 8 heuristics";
  factors.push({
    key: "fraudSignals",
    label: "Fraud Signal Scan",
    weight: WEIGHTS.fraudSignals,
    score: fraudScore,
    impact: fraudScore >= 72 ? "positive" : fraudScore <= 48 ? "negative" : "neutral",
    note: fraudNote,
  });
  rationale.push(`fraud scan: ${fraudProbability}% - ${fraudNote}`);

  /* ── Composite score + derived economics ── */
  const composite = factors.reduce((acc, f) => acc + f.weight * f.score, 0);
  const riskScore = Math.round(clampNum(composite, 1, 99));
  const tier = classifyRisk(riskScore);

  // Discount = base + credit-risk premium + time value of term + fraud premium.
  const discountRateBps = Math.round(
    clampNum(
      200 + (100 - riskScore) * 10 + p.termDays * 1.6 + fraudProbability * 6,
      180,
      2000
    )
  );

  // Safer paper unlocks a larger upfront stream; fraud risk holds capital back.
  const advanceRatePct = Math.round(
    clampNum(52 + riskScore * 0.45 - fraudProbability * 0.6, 55, 93)
  );

  // LP-facing APY: annualize the discount over the term, then apply the pool's
  // capture ratio (its slice of the 90/7/3 split, levered by utilization).
  const grossAnnualized = (discountRateBps / 10000) * (365 / p.termDays);
  const expectedYieldAPY = round2(
    clampNum(grossAnnualized * POOL_CAPTURE * 100, 1, 60)
  );

  rationale.push(
    `verdict: tier ${tier} · risk ${riskScore}/100 · discount ${(discountRateBps / 100).toFixed(2)}% · advance ${advanceRatePct}% of face · LP APY ${expectedYieldAPY.toFixed(2)}%`
  );

  /* ── 256-bit deterministic commitment over payload + scores ── */
  const canonical = [
    SENTRY_MODEL_ID,
    p.debtorName, p.supplierName, p.faceValueUSD, p.termDays, p.dueDate,
    p.sector, p.debtorYearsTrading, p.priorInvoicesPaid,
    p.priorInvoicesDefaulted, p.asOf,
    riskScore, fraudProbability, discountRateBps, advanceRatePct,
    expectedYieldAPY,
  ].join("|");
  const auditHash = commitmentHash(canonical);

  rationale.push(
    `commitment ${auditHash} -> SynturaSentryRegistry.commitRiskScore()`
  );

  return {
    riskScore,
    fraudProbability,
    discountRateBps,
    tier,
    advanceRatePct,
    expectedYieldAPY,
    factors,
    rationale,
    auditHash,
  };
}
