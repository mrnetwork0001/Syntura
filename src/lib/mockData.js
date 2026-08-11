/**
 * Seed data for demo mode — realistic invoice book, vault metrics and audit
 * trail so the dApp demos convincingly before contracts are wired to mainnet.
 *
 * Invoice shape (single source of truth for the whole UI):
 * {
 *   id: number,
 *   supplier: string (0x address),
 *   supplierName: string,
 *   debtorName: string,
 *   faceValueUSD: number,
 *   dueDate: string (ISO),
 *   termDays: number,
 *   sector: string,
 *   riskScore: number 0-100 (higher = safer),
 *   fraudProbability: number 0-100,
 *   discountRateBps: number,
 *   status: "Pending" | "Underwritten" | "Streaming" | "Settled",
 *   streamedPct: number 0-100,
 *   txHash: string,
 *   mintedAt: string (ISO),
 * }
 */

export const SEED_INVOICES = [
  {
    id: 1,
    supplier: "0x8Fa3b7c21D094aE59Bb2f4C1e83D9dA6f42C11a9",
    supplierName: "Lagos Logistics Co.",
    debtorName: "Dangote Industries",
    faceValueUSD: 125000,
    dueDate: "2026-09-25",
    termDays: 45,
    sector: "Logistics & Freight",
    riskScore: 88,
    fraudProbability: 2.1,
    discountRateBps: 420,
    status: "Streaming",
    streamedPct: 62,
    txHash:
      "0x7d4a1f8e2b9c6a3d5e0f4b8a7c2d9e1f6a3b5c8d0e2f4a6b8c1d3e5f7a9b0c2d",
    mintedAt: "2026-07-28",
  },
  {
    id: 2,
    supplier: "0x3C9eD4f70A215bB86Cc1E92d4F7a8B3c5D6E0F12",
    supplierName: "Nairobi DevWorks",
    debtorName: "Safaricom PLC",
    faceValueUSD: 48500,
    dueDate: "2026-08-30",
    termDays: 30,
    sector: "Software Services",
    riskScore: 93,
    fraudProbability: 0.8,
    discountRateBps: 310,
    status: "Settled",
    streamedPct: 100,
    txHash:
      "0x2e8b5c1d9f0a4e7b3c6d8a2f5e9b1c4d7a0e3f6b9c2d5e8a1f4b7c0d3e6a9f2b",
    mintedAt: "2026-07-14",
  },
  {
    id: 3,
    supplier: "0xA15fE68c3D027cC94Dd3F0A5b6C8d9E1F2A3B4C5",
    supplierName: "Accra AgroExports",
    debtorName: "Unilever Ghana",
    faceValueUSD: 86200,
    dueDate: "2026-10-12",
    termDays: 60,
    sector: "Agriculture & FMCG",
    riskScore: 81,
    fraudProbability: 3.4,
    discountRateBps: 505,
    status: "Underwritten",
    streamedPct: 0,
    txHash:
      "0x9f1c4d7a0e3b6c9d2e5f8a1b4c7d0e3f6a9b2c5d8e1f4a7b0c3d6e9f2a5b8c1d",
    mintedAt: "2026-08-02",
  },
  {
    id: 4,
    supplier: "0x5B8dC13fE97a2064Aa8B3C4d5E6F7a8B9C0D1E2F",
    supplierName: "Cape Town MedSupply",
    debtorName: "Netcare Group",
    faceValueUSD: 212400,
    dueDate: "2026-11-05",
    termDays: 90,
    sector: "Healthcare Supply",
    riskScore: 76,
    fraudProbability: 4.9,
    discountRateBps: 615,
    status: "Streaming",
    streamedPct: 28,
    txHash:
      "0x4b7a0c3d6e9f2a5b8c1d4e7f0a3b6c9d2e5f8a1b4c7d0e3f6a9b2c5d8e1f4a7b",
    mintedAt: "2026-08-06",
  },
  {
    id: 5,
    supplier: "0xE97b30A4c5D6e7F8a9B0C1d2E3F4a5B6C7D8E9F0",
    supplierName: "Kigali Creative Studio",
    debtorName: "MTN Rwanda",
    faceValueUSD: 19750,
    dueDate: "2026-09-08",
    termDays: 21,
    sector: "Media & Design",
    riskScore: 90,
    fraudProbability: 1.5,
    discountRateBps: 285,
    status: "Settled",
    streamedPct: 100,
    txHash:
      "0x1d4e7f0a3b6c9d2e5f8a1b4c7d0e3f6a9b2c5d8e1f4a7b0c3d6e9f2a5b8c1d4e",
    mintedAt: "2026-07-21",
  },
];

export const SEED_VAULT = {
  totalLiquidityUSD: 1284500,
  activeStreamsUSD: 297384,
  averageYieldAPY: 11.42,
  poolUtilizationPct: 63.8,
  providers: 214,
  yourDepositUSD: 0,
  yourYieldUSD: 0,
  feeSplit: { supplierPct: 90, poolPct: 7, treasuryPct: 3 },
};

export const SEED_AUDIT_LOG = [
  {
    id: "evt-001",
    ts: "2026-08-11T09:12:44Z",
    type: "SETTLEMENT",
    label: "Invoice #2 settled — 90/7/3 fee split executed",
    txHash:
      "0x2e8b5c1d9f0a4e7b3c6d8a2f5e9b1c4d7a0e3f6b9c2d5e8a1f4b7c0d3e6a9f2b",
    detail: "Supplier $43,650 · Pool $3,395 · Treasury $1,455",
  },
  {
    id: "evt-002",
    ts: "2026-08-10T17:48:02Z",
    type: "AI_UNDERWRITE",
    label: "AI Sentry underwrote Invoice #3 — risk 81/100 @ 5.05%",
    txHash:
      "0x9f1c4d7a0e3b6c9d2e5f8a1b4c7d0e3f6a9b2c5d8e1f4a7b0c3d6e9f2a5b8c1d",
    detail: "Fraud probability 3.4% · Audit hash committed on-chain",
  },
  {
    id: "evt-003",
    ts: "2026-08-10T11:05:19Z",
    type: "STREAM",
    label: "Streaming started for Invoice #4 — $212,400 face value",
    txHash:
      "0x4b7a0c3d6e9f2a5b8c1d4e7f0a3b6c9d2e5f8a1b4c7d0e3f6a9b2c5d8e1f4a7b",
    detail: "Real-time payout to Cape Town MedSupply",
  },
  {
    id: "evt-004",
    ts: "2026-08-09T14:22:56Z",
    type: "DEPOSIT",
    label: "Liquidity deposit — $50,000 into streaming vault",
    txHash:
      "0x6a9b2c5d8e1f4a7b0c3d6e9f2a5b8c1d4e7f0a3b6c9d2e5f8a1b4c7d0e3f6a9b",
    detail: "Provider 0x71C2…9E4d · Pool utilization 63.8%",
  },
  {
    id: "evt-005",
    ts: "2026-08-08T08:37:31Z",
    type: "MINT",
    label: "Invoice #4 tokenized as RWA NFT on BOTChain",
    txHash:
      "0x4b7a0c3d6e9f2a5b8c1d4e7f0a3b6c9d2e5f8a1b4c7d0e3f6a9b2c5d8e1f4a7b",
    detail: "ERC-721 minted to 0x5B8d…1E2F",
  },
];

/** Sector options for the mint form. */
export const SECTORS = [
  "Logistics & Freight",
  "Software Services",
  "Agriculture & FMCG",
  "Healthcare Supply",
  "Media & Design",
  "Manufacturing",
  "Construction",
  "Retail & E-Commerce",
  "Energy & Utilities",
  "Other",
];
