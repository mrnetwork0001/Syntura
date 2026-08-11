import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conditional logic. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/** Format a number as USD, e.g. 125000 -> "$125,000". */
export function formatUSD(value, { compact = false, decimals } = {}) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: decimals ?? (compact ? 2 : 0),
  }).format(value);
}

/** Format a ratio (0.0842) or percent value (8.42) as "8.42%". */
export function formatPercent(value, decimals = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Number(value).toFixed(decimals)}%`;
}

/** Basis points -> "8.25%". */
export function bpsToPercent(bps, decimals = 2) {
  return formatPercent(bps / 100, decimals);
}

/** Shorten an EVM address: 0x1234…abcd. */
export function shortAddress(addr, chars = 4) {
  if (!addr) return "—";
  return `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}`;
}

/** Shorten a tx hash for display. */
export function shortHash(hash, chars = 6) {
  if (!hash) return "—";
  return `${hash.slice(0, chars + 2)}…${hash.slice(-chars)}`;
}

/** ISO date string -> "Sep 14, 2026". Pass { utc: true } to format in UTC. */
export function formatDate(iso, { utc = false } = {}) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(utc ? { timeZone: "UTC" } : {}),
  });
}

/** Timestamp -> "14:32:08". Pass { utc: true } to format in UTC. */
export function formatTime(ts, { utc = false } = {}) {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour12: false,
    ...(utc ? { timeZone: "UTC" } : {}),
  });
}

/** Days between now and an ISO date (can be negative if past). */
export function daysUntil(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

/** Deterministic pseudo-random hex string for demo tx hashes. */
export function pseudoTxHash(seed) {
  let h = 0x811c9dc5;
  const s = `${seed}-${Date.now()}-${Math.random()}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let hex = "";
  for (let i = 0; i < 8; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    hex += (h >>> 0).toString(16).padStart(8, "0");
  }
  return `0x${hex.slice(0, 64)}`;
}

/** Clamp a number into [min, max]. */
export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
