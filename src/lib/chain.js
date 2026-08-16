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

export const VAULT_ABI = [
  "function depositLiquidity() payable",
  "function withdrawLiquidity(uint256 amount)",
  "function streamPayout(uint256 invoiceId)",
  "function settleInvoice(uint256 invoiceId) payable",
  "function withdrawYield()",
  "function totalLiquidity() view returns (uint256)",
  "function availableLiquidity() view returns (uint256)",
  "function providerCount() view returns (uint256)",
  "function depositOf(address provider) view returns (uint256)",
  "function streamedOf(uint256 invoiceId) view returns (uint256)",
  "function totalOutstandingAdvances() view returns (uint256)",
  "function totalPoolFeesAccrued() view returns (uint256)",
  "function yieldOf(address provider) view returns (uint256)",
  "event LiquidityDeposited(address indexed provider, uint256 amount)",
  "event LiquidityWithdrawn(address indexed provider, uint256 amount)",
  "event PayoutStreamed(uint256 indexed invoiceId, address indexed supplier, uint256 amount)",
  "event YieldWithdrawn(address indexed provider, uint256 amount)",
  "event SettlementExecuted(uint256 indexed invoiceId, uint256 supplierPayout, uint256 poolFee, uint256 treasuryFee)",
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

/** Connect the injected wallet (MetaMask etc.). Returns { provider, signer, address } or null. */
export async function connectWallet() {
  if (typeof window === "undefined" || !window.ethereum) return null;
  const provider = new BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = await provider.getSigner();
  return { provider, signer, address: await signer.getAddress() };
}

/** Prompt the wallet to add/switch to BOTChain Mainnet. */
export async function switchToBOTChain() {
  if (!window.ethereum || !BOTCHAIN.chainId) return false;
  const hexId = `0x${BOTCHAIN.chainId.toString(16)}`;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexId }],
    });
    return true;
  } catch (err) {
    if (err?.code === 4902) {
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
      return true;
    }
    return false;
  }
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
  return Boolean(CONTRACTS.invoiceNFT && CONTRACTS.vault);
}

/**
 * On-chain value scale: invoices are denominated in USD, settlement legs move
 * native BOT at 1 USD = 1e12 wei (documented protocol constant). A $125,000
 * invoice therefore settles with 0.125 BOT of real value — every flow is a
 * genuine mainnet transaction without requiring six-figure balances.
 */
export const WEI_PER_USD = 10n ** 12n;

/** USD number -> bigint wei at the protocol scale. */
export function usdToWei(usd) {
  // Round to cents first so float noise can't corrupt the bigint conversion.
  return (BigInt(Math.round(Number(usd) * 100)) * WEI_PER_USD) / 100n;
}

/** bigint wei -> USD number at the protocol scale. */
export function weiToUsd(wei) {
  return Number((wei * 100n) / WEI_PER_USD) / 100;
}

/** First block to scan for protocol events (set after deployment to speed reads). */
export const DEPLOY_BLOCK = Number(import.meta.env.VITE_DEPLOY_BLOCK || 0);
