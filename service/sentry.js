/**
 * Syntura autonomous AI Risk Sentry.
 *
 * Watches BOTChain for minted invoices, reruns the SAME open-source model the
 * browser runs (../src/agent/aiSentryAgent.js), and submits the verdict onchain
 * from its own registered sentry key:
 *
 *   SynturaInvoiceNFT.underwriteInvoice(id, riskScore, discountRateBps, auditHash)
 *   SynturaSentryRegistry.commitRiskScore(id, riskScore, auditHash)
 *
 * The supplier only ever signs the mint. This process is the sentry, so no
 * browser ever holds a sentry key.
 *
 *   node sentry.js          watch forever
 *   node sentry.js --once   one pass, then exit (cron / smoke test)
 *
 * Determinism: the model is pinned to the mint block's UTC date (`asOf`), so a
 * verdict produced days later by a catch-up sweep is bit-identical to the one
 * the supplier's browser predicted on mint day, and anyone can reproduce it.
 */

import { config as loadEnv } from "dotenv";
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  formatEther,
  isAddress,
  parseEther,
} from "ethers";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SENTRY_MODEL_ID,
  underwriteInvoice as runModel,
} from "../src/agent/aiSentryAgent.js";

const HERE = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(HERE, ".env") });

/* ── Configuration ──────────────────────────────────────────────────────── */

const ONCE = process.argv.slice(2).includes("--once");

const EXPECTED_CHAIN_ID = 677;
const BACKOFF_MAX_MS = 60_000;
const MAX_ATTEMPTS = 6; // per-invoice retry budget before quarantine
const DONE_HISTORY = 1000; // ids kept in the persisted `done` list
const MIN_BLOCK_SPAN = 32;
const GAS_FLOOR_WEI = parseEther("0.01");
const ZERO_HASH = `0x${"00".repeat(32)}`;
const MAX_DISCOUNT_BPS = 5000; // SynturaInvoiceNFT.MAX_DISCOUNT_BPS

/** Onchain USD scale: 1 USD = 1e12 wei (mirrors WEI_PER_USD in src/lib/chain.js,
 *  reimplemented here because that module is browser-only). */
const WEI_PER_USD = 10n ** 12n;
const weiToUsd = (wei) => Number((BigInt(wei) * 100n) / WEI_PER_USD) / 100;

function envInt(name, fallback, min) {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.floor(raw));
}

const POLL_MS = envInt("POLL_MS", 6000, 1000);
const MAX_BLOCK_SPAN = envInt("MAX_BLOCK_SPAN", 2000, MIN_BLOCK_SPAN);
const CONFIRMATIONS = envInt("CONFIRMATIONS", 1, 1);
const START_BLOCK = envInt("START_BLOCK", 0, 0);
const STATE_FILE = (() => {
  const raw = (process.env.STATE_FILE || "./state.json").trim();
  return isAbsolute(raw) ? raw : resolve(HERE, raw);
})();

/* ── Logging (single line per event, never any secret) ───────────────────── */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL = LEVELS[String(process.env.LOG_LEVEL || "info").toLowerCase()] ?? LEVELS.info;

function log(level, message, fields) {
  if (LEVELS[level] < MIN_LEVEL) return;
  let line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
  if (fields) {
    for (const [key, value] of Object.entries(fields)) {
      if (value === undefined || value === null) continue;
      line += ` ${key}=${value}`;
    }
  }
  const stream = LEVELS[level] >= LEVELS.warn ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

function fatal(message) {
  log("error", message);
  process.exit(1);
}

/** Compact, secret-free error description for logs and state. */
function describeError(err) {
  const parts = [
    revertName(err),
    err?.shortMessage || err?.reason,
    err?.info?.error?.message || err?.error?.message,
  ]
    .filter((part) => typeof part === "string" && part.trim())
    .map((part) => part.replace(/\s+/g, " ").trim());
  const unique = [...new Set(parts)].slice(0, 2);
  const text = unique.length > 0 ? unique.join(": ") : String(err?.message || err);
  return JSON.stringify(text.replace(/\s+/g, " ").slice(0, 180));
}

function errorText(err) {
  return [
    err?.code,
    err?.revert?.name,
    err?.reason,
    err?.shortMessage,
    err?.info?.error?.message,
    err?.error?.message,
    err?.message,
  ]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();
}

/** Raw revert payload, wherever the provider hid it. */
function revertData(err) {
  const isHex = (v) => typeof v === "string" && /^0x[0-9a-fA-F]{8,}$/.test(v);
  for (const candidate of [err?.data, err?.info?.error?.data, err?.error?.data, err?.info?.data]) {
    if (isHex(candidate)) return candidate;
    if (candidate && typeof candidate === "object" && isHex(candidate.data)) return candidate.data;
  }
  return null;
}

/**
 * Custom-error name behind a revert. `err.revert` is only populated on the
 * contract read path; gas estimation and broadcast surface raw error data, so
 * decode it against both interfaces ourselves.
 */
function revertName(err) {
  if (err?.revert?.name) return err.revert.name;
  const data = revertData(err);
  if (!data) return null;
  let ifaces = [];
  try {
    ifaces = [invoiceNFT.interface, sentryRegistry.interface];
  } catch {
    return null; // called before the contracts are wired
  }
  for (const iface of ifaces) {
    try {
      const parsed = iface.parseError(data);
      if (parsed?.name) return parsed.name;
    } catch {
      /* not one of ours */
    }
  }
  return null;
}

/** Reverts meaning "someone already recorded this verdict" - a success for us. */
function isAlreadyUnderwritten(err) {
  const name = revertName(err);
  if (name === "AlreadyUnderwritten" || name === "AlreadySettled") return true;
  return /already ?underwritten|already ?settled/.test(errorText(err));
}

const TRANSIENT_CODES = new Set([
  "NETWORK_ERROR", "SERVER_ERROR", "TIMEOUT", "ECONNRESET", "ECONNREFUSED",
  "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND", "EPIPE",
]);
const PERMANENT_CODES = new Set([
  "CALL_EXCEPTION", "INSUFFICIENT_FUNDS", "NONCE_EXPIRED", "INVALID_ARGUMENT",
  "UNSUPPORTED_OPERATION", "ACTION_REJECTED",
]);

/**
 * Provider/network trouble: retry with backoff rather than blaming an invoice.
 * A decodable revert is never transient - and error blobs carry hex data, so
 * this must never match on loose substrings like a bare status number.
 */
function isTransient(err) {
  const code = String(err?.code || "");
  if (PERMANENT_CODES.has(code) || revertData(err)) return false;
  if (TRANSIENT_CODES.has(code)) return true;
  return /fetch failed|socket hang up|connection (reset|refused|closed)|econnreset|econnrefused|etimedout|enotfound|eai_again|network error|timed? ?out|rate ?limit|too many requests|bad gateway|service unavailable|gateway time ?out|server error/
    .test(errorText(err));
}

/** RPC refusing the requested block range: shrink the chunk and retry. */
function isRangeRejected(err) {
  return /range|too many|limit exceeded|query returned more than|block span|logs matched/
    .test(errorText(err));
}

/* ── ABIs (custom errors included so reverts decode by name) ─────────────── */

const INVOICE_NFT_ABI = [
  "function totalInvoices() view returns (uint256)",
  "function getInvoice(uint256 invoiceId) view returns (tuple(uint256 invoiceId, address supplier, string debtorName, uint256 faceValueUSD, uint256 dueDate, uint16 riskScore, uint16 discountRateBps, bool isUnderwritten, bool isSettled))",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function auditHashOf(uint256 invoiceId) view returns (bytes32)",
  "function underwriteInvoice(uint256 invoiceId, uint16 riskScore, uint16 discountRateBps, bytes32 auditHash)",
  "event InvoiceMinted(uint256 indexed invoiceId, address indexed supplier, uint256 faceValueUSD, uint256 dueDate)",
  "error InvoiceNotFound(uint256 invoiceId)",
  "error NotSentryOrOwner(address caller)",
  "error AlreadyUnderwritten(uint256 invoiceId)",
  "error AlreadySettled(uint256 invoiceId)",
  "error RiskScoreOutOfRange(uint16 riskScore)",
  "error DiscountRateTooHigh(uint16 discountRateBps)",
  "error EmptyAuditHash()",
];

const SENTRY_REGISTRY_ABI = [
  "function isVerifiedSentry(address agent) view returns (bool)",
  "function getCommitment(uint256 invoiceId) view returns (tuple(address agent, uint16 riskScore, bytes32 auditHash, uint64 committedAt))",
  "function commitRiskScore(uint256 invoiceId, uint16 riskScore, bytes32 auditHash)",
  "error NotVerifiedSentry(address caller)",
  "error RiskScoreOutOfRange(uint16 riskScore)",
  "error EmptyAuditHash()",
];

/* ── Wiring ─────────────────────────────────────────────────────────────── */

const RPC_URL = (process.env.BOTCHAIN_RPC_URL || "").trim();
if (!RPC_URL) fatal("BOTCHAIN_RPC_URL is not set - copy service/.env.example to service/.env");

function requireAddress(name) {
  const value = (process.env[name] || "").trim();
  if (!isAddress(value)) fatal(`${name} must be a checksummed contract address in service/.env`);
  return value;
}
const INVOICE_NFT_ADDRESS = requireAddress("INVOICE_NFT_ADDRESS");
const SENTRY_REGISTRY_ADDRESS = requireAddress("SENTRY_REGISTRY_ADDRESS");

const provider = new JsonRpcProvider(RPC_URL, undefined, { staticNetwork: true });

const rawKey = (process.env.SENTRY_PRIVATE_KEY || "").trim();
if (!rawKey || rawKey === "0xYOUR_SENTRY_KEY") {
  fatal("SENTRY_PRIVATE_KEY is not set in service/.env - provision a dedicated sentry key");
}
let wallet;
try {
  wallet = new Wallet(rawKey, provider);
} catch {
  // Deliberately swallow the underlying error: it can echo the key material.
  fatal("SENTRY_PRIVATE_KEY is not a valid 32-byte hex private key");
}

const invoiceNFT = new Contract(INVOICE_NFT_ADDRESS, INVOICE_NFT_ABI, wallet);
const sentryRegistry = new Contract(SENTRY_REGISTRY_ADDRESS, SENTRY_REGISTRY_ABI, wallet);

/* ── State (atomic on-disk journal) ─────────────────────────────────────── */

function emptyState() {
  return {
    lastProcessedBlock: 0,
    pending: new Set(),
    done: new Set(),
    failed: new Set(),
    attempts: new Map(), // id -> { attempts, nextAttemptAt, lastError }
  };
}

const asIdSet = (value) =>
  new Set((Array.isArray(value) ? value : []).map(Number).filter(Number.isInteger));

async function loadState() {
  const state = emptyState();
  let raw;
  try {
    raw = await readFile(STATE_FILE, "utf8");
  } catch (err) {
    if (err?.code !== "ENOENT") {
      log("warn", "state file unreadable - starting from a full catch-up sweep", {
        file: STATE_FILE,
        error: describeError(err),
      });
    }
    return state;
  }
  try {
    const parsed = JSON.parse(raw);
    state.lastProcessedBlock = Number.isInteger(parsed?.lastProcessedBlock)
      ? parsed.lastProcessedBlock
      : 0;
    state.pending = asIdSet(parsed?.pending);
    state.done = asIdSet(parsed?.done);
    state.failed = asIdSet(parsed?.failed);
    for (const [key, value] of Object.entries(parsed?.attempts || {})) {
      const id = Number(key);
      if (!Number.isInteger(id)) continue;
      state.attempts.set(id, {
        attempts: Number(value?.attempts) || 0,
        nextAttemptAt: Number(value?.nextAttemptAt) || 0,
        lastError: typeof value?.lastError === "string" ? value.lastError : undefined,
      });
    }
    log("info", "state restored", {
      file: STATE_FILE,
      lastProcessedBlock: state.lastProcessedBlock,
      pending: state.pending.size,
      done: state.done.size,
      failed: state.failed.size,
    });
  } catch (err) {
    log("warn", "state file is corrupt - starting from a full catch-up sweep", {
      file: STATE_FILE,
      error: describeError(err),
    });
    return emptyState();
  }
  return state;
}

const sortedIds = (set) => [...set].sort((a, b) => a - b);

async function saveState(state) {
  const done = sortedIds(state.done).slice(-DONE_HISTORY);
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    lastProcessedBlock: state.lastProcessedBlock,
    pending: sortedIds(state.pending),
    done,
    failed: sortedIds(state.failed),
    attempts: Object.fromEntries([...state.attempts].map(([id, rec]) => [String(id), rec])),
  };
  const tmp = `${STATE_FILE}.tmp`;
  try {
    await mkdir(dirname(STATE_FILE), { recursive: true });
    await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await rename(tmp, STATE_FILE); // atomic within the same filesystem
  } catch (err) {
    log("error", "could not persist state - continuing in memory", {
      file: STATE_FILE,
      error: describeError(err),
    });
  }
}

function markDone(state, id) {
  state.pending.delete(id);
  state.failed.delete(id);
  state.attempts.delete(id);
  state.done.add(id);
}

function markPending(state, id, err) {
  const rec = state.attempts.get(id) || { attempts: 0, nextAttemptAt: 0 };
  rec.attempts += 1;
  rec.lastError = describeError(err);
  if (rec.attempts >= MAX_ATTEMPTS) {
    state.pending.delete(id);
    state.attempts.delete(id);
    state.failed.add(id);
    log("error", `invoice quarantined after ${MAX_ATTEMPTS} failed attempts - fix the cause and restart the service to retry`, {
      invoice: id,
      error: rec.lastError,
    });
    return;
  }
  const waitMs = Math.min(BACKOFF_MAX_MS, POLL_MS * 2 ** (rec.attempts - 1));
  rec.nextAttemptAt = Date.now() + waitMs;
  state.attempts.set(id, rec);
  state.pending.add(id);
  log("warn", "invoice failed - queued for retry", {
    invoice: id,
    attempt: `${rec.attempts}/${MAX_ATTEMPTS}`,
    retryInMs: waitMs,
    error: rec.lastError,
  });
}

/** Re-queues ids a halted pass never reached, without spending retry budget. */
function queueRemaining(state, ids) {
  for (const id of ids) {
    if (state.done.has(id) || state.failed.has(id)) continue;
    state.pending.add(id);
  }
}

/* ── Shutdown + sleep ───────────────────────────────────────────────────── */

let running = true;
let stopping = false;
let wake = null;

function sleep(ms) {
  return new Promise((res) => {
    const timer = setTimeout(() => {
      wake = null;
      res();
    }, ms);
    wake = () => {
      clearTimeout(timer);
      wake = null;
      res();
    };
  });
}

function onSignal(signal) {
  if (stopping) {
    log("warn", `second ${signal} - exiting immediately`);
    process.exit(0);
  }
  stopping = true;
  running = false;
  log("warn", `${signal} received - finishing the in-flight invoice, then exiting`);
  if (wake) wake();
}
process.on("SIGINT", () => onSignal("SIGINT"));
process.on("SIGTERM", () => onSignal("SIGTERM"));
process.on("unhandledRejection", (err) => {
  log("error", "unhandled rejection", { error: describeError(err) });
});

/* ── Chain reads ────────────────────────────────────────────────────────── */

const mintContexts = new Map(); // id -> { blockNumber, timestampMs }

/** Newest-first chunked search for an invoice's InvoiceMinted block. */
async function findMintBlock(id) {
  const head = await provider.getBlockNumber();
  const floor = Math.max(0, START_BLOCK);
  const filter = invoiceNFT.filters.InvoiceMinted(id);
  let span = MAX_BLOCK_SPAN;
  let to = head;
  while (to >= floor) {
    const from = Math.max(floor, to - span + 1);
    try {
      const logs = await invoiceNFT.queryFilter(filter, from, to);
      if (logs.length > 0) return logs[logs.length - 1].blockNumber;
      to = from - 1;
    } catch (err) {
      if (isRangeRejected(err) && span > MIN_BLOCK_SPAN) {
        span = Math.max(MIN_BLOCK_SPAN, Math.floor(span / 4));
        continue;
      }
      throw err;
    }
  }
  return null;
}

/** Mint block + timestamp for an invoice, cached; `hintBlock` skips the search. */
async function mintContextFor(id, hintBlock) {
  const cached = mintContexts.get(id);
  if (cached) return cached;
  const blockNumber = Number.isInteger(hintBlock) ? hintBlock : await findMintBlock(id);
  let context = { blockNumber: null, timestampMs: null };
  if (Number.isInteger(blockNumber)) {
    const block = await provider.getBlock(blockNumber);
    if (block) {
      context = { blockNumber, timestampMs: Number(block.timestamp) * 1000 };
    }
  }
  mintContexts.set(id, context);
  return context;
}

/** Chunked forward scan of InvoiceMinted logs, shrinking on RPC range limits. */
async function scanMintedLogs(fromBlock, toBlock) {
  const filter = invoiceNFT.filters.InvoiceMinted();
  const events = [];
  let span = MAX_BLOCK_SPAN;
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const chunkTo = Math.min(cursor + span - 1, toBlock);
    try {
      events.push(...(await invoiceNFT.queryFilter(filter, cursor, chunkTo)));
      cursor = chunkTo + 1;
    } catch (err) {
      if (isRangeRejected(err) && span > MIN_BLOCK_SPAN) {
        span = Math.max(MIN_BLOCK_SPAN, Math.floor(span / 4));
        log("warn", "RPC rejected the log range - shrinking chunk", { span });
        continue;
      }
      throw err;
    }
  }
  return events;
}

function decodeDataUri(uri) {
  const comma = uri.indexOf(",");
  if (comma < 0) return "";
  const header = uri.slice(0, comma);
  const body = uri.slice(comma + 1);
  if (/;base64/i.test(header)) return Buffer.from(body, "base64").toString("utf8");
  return decodeURIComponent(body);
}

/** tokenURI holds raw JSON; data: URIs and junk are tolerated. */
async function readMetadata(id) {
  let uri;
  try {
    uri = await invoiceNFT.tokenURI(id);
  } catch (err) {
    if (isTransient(err)) throw err;
    log("debug", "tokenURI unavailable - using model defaults", { invoice: id });
    return {};
  }
  const text = String(uri || "").trim();
  if (!text) return {};
  const json = text.startsWith("data:") ? decodeDataUri(text) : text;
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    log("warn", "invoice metadata is not valid JSON - using model defaults", { invoice: id });
    return {};
  }
}

/* ── Payload reconstruction ─────────────────────────────────────────────── */

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

function optionalNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function optionalString(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}

/**
 * Rebuilds the exact model payload from chain state + token metadata. Optional
 * fields are omitted rather than guessed, so the service and the browser fall
 * through to identical model defaults and produce identical audit hashes.
 */
function buildPayload(invoice, metadata, mintContext) {
  const faceValueUSD = weiToUsd(invoice.faceValueUSD);
  const dueMs = Number(invoice.dueDate) * 1000;
  const dueValid = Number.isFinite(dueMs) && dueMs > 0 && dueMs < 8.64e15;
  const anchorMs = mintContext.timestampMs ?? Date.now();

  let termDays = optionalNumber(metadata.termDays);
  if (termDays === null || termDays < 1) {
    termDays = dueValid ? Math.max(1, Math.round((dueMs - anchorMs) / 86_400_000)) : 30;
  }

  const payload = {
    debtorName: invoice.debtorName,
    supplierName: optionalString(metadata.supplierName) ?? "Unknown Supplier",
    sector: optionalString(metadata.sector) ?? "Other",
    faceValueUSD,
    termDays: Math.round(termDays),
    asOf: isoDay(anchorMs),
  };
  if (dueValid) payload.dueDate = isoDay(dueMs);

  for (const key of ["debtorYearsTrading", "priorInvoicesPaid", "priorInvoicesDefaulted"]) {
    const value = optionalNumber(metadata[key]);
    if (value !== null) payload[key] = value;
  }
  return payload;
}

const usd = (value) =>
  `$${Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

/* ── Underwriting ───────────────────────────────────────────────────────── */

/**
 * An invoice can be underwritten on the NFT yet missing its registry
 * commitment (e.g. the process died between the two transactions). Mirror the
 * recorded verdict into the registry so the audit trail is never half-written.
 */
async function ensureCommitment(state, id, invoice) {
  const existing = await sentryRegistry.getCommitment(id);
  if (existing.auditHash && existing.auditHash !== ZERO_HASH) {
    log("debug", "skip: already underwritten and committed", { invoice: id });
    markDone(state, id);
    return;
  }
  const auditHash = await invoiceNFT.auditHashOf(id);
  if (!auditHash || auditHash === ZERO_HASH) {
    log("debug", "skip: underwritten without a recorded audit hash", { invoice: id });
    markDone(state, id);
    return;
  }
  const riskScore = Number(invoice.riskScore);
  log("warn", "invoice underwritten without a registry commitment - committing now", {
    invoice: id,
  });
  const tx = await sentryRegistry.commitRiskScore(id, riskScore, auditHash);
  await tx.wait(CONFIRMATIONS);
  log("info", "registry commitment recovered", {
    invoice: id,
    risk: riskScore,
    commitTx: tx.hash,
  });
  markDone(state, id);
}

async function underwrite(state, id, invoice, hintBlock) {
  const metadata = await readMetadata(id);
  const mintContext = await mintContextFor(id, hintBlock);
  const payload = buildPayload(invoice, metadata, mintContext);
  const verdict = runModel(payload);

  const riskScore = Math.min(100, Math.max(0, Math.round(verdict.riskScore)));
  const discountRateBps = Math.min(
    MAX_DISCOUNT_BPS,
    Math.max(0, Math.round(verdict.discountRateBps))
  );
  const auditHash = String(verdict.auditHash || "");
  if (!/^0x[0-9a-fA-F]{64}$/.test(auditHash) || auditHash === ZERO_HASH) {
    throw new Error(`model produced an unusable audit hash for invoice ${id}`);
  }

  // Race guard: another sentry (or the owner) may have landed a verdict while
  // the model ran. Re-read immediately before spending gas.
  const fresh = await invoiceNFT.getInvoice(id);
  if (fresh.isSettled) {
    log("info", "skip: settled during analysis", { invoice: id });
    markDone(state, id);
    return;
  }
  if (fresh.isUnderwritten) {
    log("info", "skip: underwritten by another sentry during analysis", { invoice: id });
    await ensureCommitment(state, id, fresh);
    return;
  }

  // Sequential and awaited: nonce order must hold, so never fire in parallel.
  const underwriteTx = await invoiceNFT.underwriteInvoice(
    id,
    riskScore,
    discountRateBps,
    auditHash
  );
  await underwriteTx.wait(CONFIRMATIONS);
  const commitTx = await sentryRegistry.commitRiskScore(id, riskScore, auditHash);
  await commitTx.wait(CONFIRMATIONS);

  log("info", "underwritten", {
    invoice: id,
    debtor: JSON.stringify(invoice.debtorName),
    face: usd(payload.faceValueUSD),
    term: `${payload.termDays}d`,
    risk: `${riskScore}/100`,
    tier: verdict.tier,
    discount: `${(discountRateBps / 100).toFixed(2)}%`,
    fraud: `${verdict.fraudProbability}%`,
    asOf: payload.asOf,
    auditHash,
    underwriteTx: underwriteTx.hash,
    commitTx: commitTx.hash,
  });
  markDone(state, id);
}

async function processInvoice(state, id, hintBlock) {
  const invoice = await invoiceNFT.getInvoice(id);
  if (invoice.isSettled) {
    log("debug", "skip: already settled", { invoice: id });
    markDone(state, id);
    return;
  }
  if (invoice.isUnderwritten) {
    await ensureCommitment(state, id, invoice);
    return;
  }
  try {
    await underwrite(state, id, invoice, hintBlock);
  } catch (err) {
    if (!isAlreadyUnderwritten(err)) throw err;
    log("info", "already underwritten onchain - reconciling", { invoice: id });
    await ensureCommitment(state, id, await invoiceNFT.getInvoice(id));
  }
}

/* ── Passes ─────────────────────────────────────────────────────────────── */

let verified = null;

async function checkVerification() {
  const ok = await sentryRegistry.isVerifiedSentry(wallet.address);
  if (ok !== verified) {
    if (ok) {
      log("info", "sentry is registry-verified", {
        address: wallet.address,
        model: SENTRY_MODEL_ID,
      });
    } else {
      log(
        "error",
        `SENTRY NOT VERIFIED - underwriting will revert until the protocol owner calls registerSentry(${wallet.address}, "${SENTRY_MODEL_ID}") on SynturaSentryRegistry. Polling continues.`,
        { registry: SENTRY_REGISTRY_ADDRESS }
      );
    }
    verified = ok;
  }
  return ok;
}

/**
 * One pass. `fullSweep` walks every minted id (catch-up for invoices minted
 * while the service was down); otherwise only new InvoiceMinted logs plus the
 * retry set are considered.
 */
async function runPass(state, fullSweep) {
  await checkVerification();

  // Order matters: capture the head BEFORE reading totalInvoices, so a mint
  // racing this pass is either inside `total` (swept) or above `head` (scanned
  // next pass). Never both-missed.
  const currentBlock = await provider.getBlockNumber();
  const headBlock = Math.max(0, currentBlock - (CONFIRMATIONS - 1));
  const total = Number(await invoiceNFT.totalInvoices());

  const candidates = new Map(); // id -> hint block or null

  if (fullSweep) {
    log("info", "catch-up sweep", { invoices: total, head: headBlock });
    for (let id = 1; id <= total; id += 1) {
      if (!state.done.has(id) && !state.failed.has(id)) candidates.set(id, null);
    }
  } else {
    const fromBlock = Math.max(state.lastProcessedBlock + 1, START_BLOCK);
    if (headBlock >= fromBlock) {
      const events = await scanMintedLogs(fromBlock, headBlock);
      for (const event of events) {
        const id = Number(event.args.invoiceId);
        if (!Number.isInteger(id) || id < 1) continue;
        candidates.set(id, event.blockNumber);
      }
      if (events.length > 0) {
        log("info", "new mints detected", {
          count: events.length,
          blocks: `${fromBlock}-${headBlock}`,
        });
      }
    }
  }

  const now = Date.now();
  for (const id of state.pending) {
    if (candidates.has(id)) continue;
    const rec = state.attempts.get(id);
    if (!rec || rec.nextAttemptAt <= now) candidates.set(id, null);
  }

  const ids = [...candidates.keys()].sort((a, b) => a - b);
  let completed = true;
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    if (!running) {
      log("warn", "shutdown requested - pass halted", { requeued: ids.length - i });
      queueRemaining(state, ids.slice(i));
      completed = false;
      break;
    }
    if (id > total) continue; // reorg or stale log: nothing to read yet
    try {
      await processInvoice(state, id, candidates.get(id));
    } catch (err) {
      markPending(state, id, err);
      if (isTransient(err)) {
        // Provider trouble, not invoice trouble: keep every id we never reached
        // so the retry set - not the block watermark - guarantees coverage.
        queueRemaining(state, ids.slice(i + 1));
        completed = false;
        await saveState(state);
        throw err;
      }
    }
    await saveState(state);
  }

  // Only advance the watermark when the whole pass landed, so an aborted pass
  // rescans its block range instead of silently skipping invoices.
  if (completed && headBlock > state.lastProcessedBlock) {
    state.lastProcessedBlock = headBlock;
  }
}

/* ── Boot ───────────────────────────────────────────────────────────────── */

/**
 * Startup identity probe. A cold VPS often boots before the network is usable,
 * so a transient failure here waits and retries instead of exiting.
 */
async function probeChain() {
  let backoffMs = 0;
  while (running) {
    try {
      const [network, balance] = await Promise.all([
        provider.getNetwork(),
        provider.getBalance(wallet.address),
      ]);
      return { chainId: Number(network.chainId), balance };
    } catch (err) {
      if (!isTransient(err) || ONCE) throw err;
      backoffMs = Math.min(BACKOFF_MAX_MS, backoffMs ? backoffMs * 2 : Math.max(POLL_MS, 1000));
      log("warn", "RPC unreachable - retrying", {
        rpc: RPC_URL,
        retryInMs: backoffMs,
        error: describeError(err),
      });
      await sleep(backoffMs);
    }
  }
  return null;
}

async function run() {
  log("info", "syntura sentry starting", {
    model: SENTRY_MODEL_ID,
    mode: ONCE ? "once" : "watch",
    node: process.version,
  });

  const identity = await probeChain();
  if (!identity) {
    log("info", "sentry stopped before startup completed");
    return;
  }
  const { chainId, balance } = identity;
  log("info", "sentry wallet", {
    address: wallet.address,
    chainId,
    balance: `${formatEther(balance)} BOT`,
  });
  if (chainId !== EXPECTED_CHAIN_ID) {
    log("warn", `RPC reports chain ${chainId}, expected BOT Chain Mainnet ${EXPECTED_CHAIN_ID}`, {
      rpc: RPC_URL,
    });
  }
  if (balance < GAS_FLOOR_WEI) {
    log("warn", "balance is below the 0.01 BOT gas floor - top the sentry wallet up or transactions will fail", {
      address: wallet.address,
    });
  }
  log("info", "configuration", {
    invoiceNFT: INVOICE_NFT_ADDRESS,
    sentryRegistry: SENTRY_REGISTRY_ADDRESS,
    startBlock: START_BLOCK,
    pollMs: POLL_MS,
    maxBlockSpan: MAX_BLOCK_SPAN,
    confirmations: CONFIRMATIONS,
    stateFile: STATE_FILE,
  });

  const state = await loadState();
  let firstPass = true;
  let backoffMs = 0;
  let lastPassFailed = false;

  while (running) {
    // The catch-up sweep runs once per process start: a pass that dies partway
    // has already re-queued whatever it did not reach.
    const sweep = firstPass;
    firstPass = false;
    try {
      await runPass(state, sweep);
      backoffMs = 0;
      lastPassFailed = false;
    } catch (err) {
      lastPassFailed = true;
      backoffMs = Math.min(BACKOFF_MAX_MS, backoffMs ? backoffMs * 2 : Math.max(POLL_MS, 1000));
      log(isTransient(err) ? "warn" : "error", "pass failed - backing off", {
        retryInMs: backoffMs,
        error: describeError(err),
      });
    }
    await saveState(state);
    if (ONCE || !running) break;
    await sleep(backoffMs || POLL_MS);
  }

  log("info", "sentry stopped", {
    lastProcessedBlock: state.lastProcessedBlock,
    done: state.done.size,
    pending: state.pending.size,
    failed: state.failed.size,
  });
  // A completed pass exits 0 even with invoices queued for retry; a pass that
  // could not run at all exits 1 so `--once` smoke tests and cron notice.
  process.exitCode = ONCE && lastPassFailed ? 1 : 0;
}

run()
  .catch((err) => {
    log("error", "fatal error", { error: describeError(err) });
    process.exitCode = 1;
  })
  .finally(() => {
    // Releases the provider's sockets and internal timers so the process can
    // exit on its own instead of being killed by systemd's stop timeout.
    try {
      provider.destroy();
    } catch {
      /* already torn down */
    }
  });
