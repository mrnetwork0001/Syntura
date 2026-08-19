import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";

/**
 * BOTChain Mainnet configuration.
 * All values are environment-driven so the dApp can point at the official
 * BOTChain RPC/explorer endpoints without a code change.
 */
export const BOTCHAIN = {
  name: "BOTChain Mainnet",
  rpcUrl: import.meta.env.VITE_BOTCHAIN_RPC_URL || "https://rpc.botchain.ai",
  chainId: Number(import.meta.env.VITE_BOTCHAIN_CHAIN_ID || 677),
  explorerUrl:
    import.meta.env.VITE_BOTCHAIN_EXPLORER_URL || "https://scan.botchain.ai",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
};

export const CONTRACTS = {
  invoiceNFT: import.meta.env.VITE_INVOICE_NFT_ADDRESS || "",
  vault: import.meta.env.VITE_VAULT_ADDRESS || "",
  sentryRegistry: import.meta.env.VITE_SENTRY_REGISTRY_ADDRESS || "",
  // Bridged USDT on BOTChain - the vault's settlement token (6 decimals).
  usdt:
    import.meta.env.VITE_USDT_ADDRESS ||
    "0xababc7ddc03e501d190c676bf3d92ef0e6e87a3c",
};

/** Human-readable ABIs (ethers v6) mirroring contracts/. */
export const INVOICE_NFT_ABI = [
  "function mintInvoice(string debtorName, uint256 faceValueUSD, uint256 dueDate, string metadataURI) returns (uint256)",
  "function underwriteInvoice(uint256 invoiceId, uint16 riskScore, uint16 discountRateBps, bytes32 auditHash)",
  "function settleInvoice(uint256 invoiceId)",
  "function getInvoice(uint256 invoiceId) view returns (tuple(uint256 invoiceId, address supplier, string debtorName, uint256 faceValueUSD, uint256 dueDate, uint16 riskScore, uint16 discountRateBps, bool isUnderwritten, bool isSettled))",
  "function totalInvoices() view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "event InvoiceMinted(uint256 indexed invoiceId, address indexed supplier, uint256 faceValueUSD, uint256 dueDate)",
  "event InvoiceUnderwritten(uint256 indexed invoiceId, uint16 riskScore, uint16 discountRateBps, bytes32 auditHash)",
  "event InvoiceSettled(uint256 indexed invoiceId, uint256 supplierPayout, uint256 poolFee, uint256 treasuryFee)",
];

/**
 * Vault ABI. Every uint256 amount here is 6-decimal USDT base units - the only
 * 18-decimal wad in the protocol is the NFT's faceValueUSD.
 */
export const VAULT_ABI = [
  "function depositLiquidity(uint256 amount)",
  "function withdrawLiquidity(uint256 amount)",
  "function streamPayout(uint256 invoiceId)",
  "function settleInvoice(uint256 invoiceId)",
  "function withdrawYield()",
  "function totalLiquidity() view returns (uint256)",
  "function availableLiquidity() view returns (uint256)",
  "function providerCount() view returns (uint256)",
  "function depositOf(address provider) view returns (uint256)",
  "function streamedOf(uint256 invoiceId) view returns (uint256)",
  "function totalOutstandingAdvances() view returns (uint256)",
  "function totalPoolFeesAccrued() view returns (uint256)",
  "function yieldOf(address provider) view returns (uint256)",
  "function faceValueUnits(uint256 invoiceId) view returns (uint256)",
  "function token() view returns (address)",
  "event LiquidityDeposited(address indexed provider, uint256 amount)",
  "event LiquidityWithdrawn(address indexed provider, uint256 amount)",
  "event PayoutStreamed(uint256 indexed invoiceId, address indexed supplier, uint256 amount)",
  "event YieldWithdrawn(address indexed provider, uint256 amount)",
  "event SettlementExecuted(uint256 indexed invoiceId, uint256 supplierPayout, uint256 poolFee, uint256 treasuryFee)",
];

/** Minimal ERC-20 surface for the settlement token (balances are token units). */
export const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

export const SENTRY_REGISTRY_ABI = [
  "function registerSentry(address agent, string modelId)",
  "function commitRiskScore(uint256 invoiceId, uint16 riskScore, bytes32 auditHash)",
  "function isVerifiedSentry(address agent) view returns (bool)",
  "event SentryRegistered(address indexed agent, string modelId)",
  "event RiskScoreCommitted(uint256 indexed invoiceId, address indexed agent, uint16 riskScore, bytes32 auditHash)",
];

/** Read-only provider against BOTChain RPC. */
export function getReadProvider() {
  return new JsonRpcProvider(BOTCHAIN.rpcUrl, undefined, {
    staticNetwork: true,
  });
}

/** Current chain id of the injected wallet, or null without one. */
export async function getWalletChainId() {
  if (typeof window === "undefined" || !window.ethereum) return null;
  const hex = await window.ethereum.request({ method: "eth_chainId" });
  return Number(hex);
}

const isUserRejection = (e) =>
  e?.code === 4001 || e?.error?.code === 4001 || e?.info?.error?.code === 4001;

/**
 * Guarantees the wallet is on BOTChain Mainnet, prompting to switch and -
 * if the chain is missing from the wallet - to add it. Wallets report
 * "unknown chain" in several shapes (bare 4902, nested originalError,
 * -32603 wrappers), so ANY non-rejection switch failure falls through to
 * wallet_addEthereumChain, which is harmless when the chain already exists.
 * The final chain id is re-read so the result is verified, never assumed.
 * Returns { ok, rejected }.
 */
export async function ensureBOTChain() {
  if (typeof window === "undefined" || !window.ethereum || !BOTCHAIN.chainId) {
    return { ok: false, rejected: false };
  }
  const hexId = `0x${BOTCHAIN.chainId.toString(16)}`;
  if ((await getWalletChainId()) === BOTCHAIN.chainId) return { ok: true, rejected: false };

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexId }],
    });
  } catch (err) {
    if (isUserRejection(err)) return { ok: false, rejected: true };
    try {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexId,
            chainName: BOTCHAIN.name,
            rpcUrls: [BOTCHAIN.rpcUrl],
            nativeCurrency: BOTCHAIN.nativeCurrency,
            blockExplorerUrls: [BOTCHAIN.explorerUrl],
          },
        ],
      });
    } catch (addErr) {
      return { ok: false, rejected: isUserRejection(addErr) };
    }
    // Some wallets add without switching - ask once more, then verify.
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hexId }],
      });
    } catch {
      /* verified below */
    }
  }
  return { ok: (await getWalletChainId()) === BOTCHAIN.chainId, rejected: false };
}

/** Back-compat alias. */
export const switchToBOTChain = async () => (await ensureBOTChain()).ok;

/**
 * Connect the injected wallet AND land it on BOTChain Mainnet. The network
 * is ensured BEFORE the signer is built so the signer is never bound to a
 * stale chain. Returns { provider, signer, address, chainOk, rejected } or
 * null when no wallet is injected.
 */
export async function connectWallet() {
  if (typeof window === "undefined" || !window.ethereum) return null;
  await window.ethereum.request({ method: "eth_requestAccounts" });
  const { ok: chainOk, rejected } = await ensureBOTChain();
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return { provider, signer, address: await signer.getAddress(), chainOk, rejected };
}

/** Typed contract handles bound to a signer or provider. */
export function getContracts(signerOrProvider) {
  return {
    invoiceNFT: CONTRACTS.invoiceNFT
      ? new Contract(CONTRACTS.invoiceNFT, INVOICE_NFT_ABI, signerOrProvider)
      : null,
    vault: CONTRACTS.vault
      ? new Contract(CONTRACTS.vault, VAULT_ABI, signerOrProvider)
      : null,
    sentryRegistry: CONTRACTS.sentryRegistry
      ? new Contract(CONTRACTS.sentryRegistry, SENTRY_REGISTRY_ABI, signerOrProvider)
      : null,
    usdt: CONTRACTS.usdt
      ? new Contract(CONTRACTS.usdt, ERC20_ABI, signerOrProvider)
      : null,
  };
}

/** Explorer deep-links. */
export function explorerTxUrl(hash) {
  return `${BOTCHAIN.explorerUrl}/tx/${hash}`;
}
export function explorerAddressUrl(addr) {
  return `${BOTCHAIN.explorerUrl}/address/${addr}`;
}

/** True when contract addresses are configured (live mode). */
export function isLiveChainConfigured() {
  return Boolean(CONTRACTS.invoiceNFT && CONTRACTS.vault && CONTRACTS.usdt);
}

/**
 * TWO SCALES, never interchangeable:
 *
 *  - Invoice face value on the NFT is an 18-decimal USD wad ($1 = 1e18):
 *    mintInvoice(faceValueUSD), Invoice.faceValueUSD, and the NFT's
 *    InvoiceMinted / InvoiceUnderwritten / InvoiceSettled amounts.
 *  - Every USDT amount is 6-decimal token base units ($1 = 1e6): all vault
 *    views and events, faceValueUnits(id), and ERC-20 balances/allowances.
 *
 * The vault converts wad -> units internally (USD_WAD_PER_TOKEN_UNIT = 1e12);
 * the frontend must never do that division - read faceValueUnits(id) instead.
 */
export const USDT_DECIMALS = 6;
export const USD_WAD_DECIMALS = 18;

/** USD number -> 18-decimal USD wad (bigint) for the invoice NFT. */
export function usdToWad(usd) {
  // Round to cents first so float noise can't corrupt the bigint conversion.
  return BigInt(Math.round(Number(usd) * 100)) * 10n ** 16n;
}

/** 18-decimal USD wad (bigint) -> USD number, truncated to cents. */
export function wadToUsd(wad) {
  return Number((BigInt(wad) * 100n) / 10n ** 18n) / 100;
}

/** USD number -> 6-decimal USDT base units (bigint). */
export function usdToUnits(usd) {
  // Same cents rounding as usdToWad, so the two scales agree to the cent.
  return BigInt(Math.round(Number(usd) * 100)) * 10n ** 4n;
}

/** 6-decimal USDT base units (bigint) -> USD number, truncated to cents. */
export function unitsToUsd(units) {
  return Number((BigInt(units) * 100n) / 10n ** 6n) / 100;
}

/** First block to scan for protocol events (set after deployment to speed reads). */
export const DEPLOY_BLOCK = Number(import.meta.env.VITE_DEPLOY_BLOCK || 0);
