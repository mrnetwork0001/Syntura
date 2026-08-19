/**
 * Syntura vault migration - native BOT to bridged USDT on BOTChain Mainnet.
 *
 * Deploys the USDT-denominated SynturaVault against the ALREADY DEPLOYED and
 * source-verified SynturaInvoiceNFT, then re-points the NFT at the new vault
 * with `setVault`. The NFT and the sentry registry keep their addresses, their
 * verified source and their history - only the vault is replaced.
 *
 * Env (all optional, defaults are the verified onchain addresses):
 *   USDT_ADDRESS        bridged USDT on BOT Chain (6 decimals)
 *   INVOICE_NFT_ADDRESS deployed SynturaInvoiceNFT
 *   TREASURY_ADDRESS    3% fee recipient (falls back to the deployer)
 *
 * Usage: npx hardhat run scripts/deploy_vault_usdt.js --network botchain
 */
import hre from "hardhat";

const { ethers } = hre;

// ─────────────────────────── Verified onchain defaults ──────────────────────

/** Bridged USDT on BOT Chain Mainnet (chain 677) - symbol USDT, decimals 6. */
const DEFAULT_USDT = "0xababc7ddc03e501d190c676bf3d92ef0e6e87a3c";
/** Deployed + source-verified SynturaInvoiceNFT (SYNV). */
const DEFAULT_INVOICE_NFT = "0xD8816ecf2D243f4B5328502ACAB83a9dF043A40a";
/** The outgoing native-BOT vault whose liquidity must be recovered separately. */
const OLD_NATIVE_VAULT = "0x7199D8db46142B784ab4De225EADf91f4F10ca14";

/** Minimal ERC-20 metadata surface used for the pre-flight token check. */
const ERC20_METADATA_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

/** Resolve a checksummed address from env, falling back to a default. */
function addressFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return ethers.getAddress(fallback);
  if (!ethers.isAddress(raw)) {
    throw new Error(`${name} is not a valid address: "${raw}"`);
  }
  return ethers.getAddress(raw);
}

async function main() {
  if (hre.network.name === "hardhat" || hre.network.name === "localhost") {
    throw new Error(
      `This migration targets BOTChain Mainnet and its live contracts, but the network is "${hre.network.name}". ` +
        "Run it with --network botchain, or use `npm run simulate` to exercise the vault locally."
    );
  }

  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer account. Set PRIVATE_KEY in .env (see .env.example).");
  }

  const network = await ethers.provider.getNetwork();
  const usdtAddress = addressFromEnv("USDT_ADDRESS", DEFAULT_USDT);
  const invoiceNFTAddress = addressFromEnv("INVOICE_NFT_ADDRESS", DEFAULT_INVOICE_NFT);
  const treasury = addressFromEnv("TREASURY_ADDRESS", deployer.address);

  console.log("");
  console.log("Syntura vault migration - native BOT to bridged USDT");
  console.log(`  network    : ${hre.network.name} (chainId ${network.chainId})`);
  console.log(`  deployer   : ${deployer.address}`);
  console.log(`  balance    : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} BOT`);
  console.log(`  invoiceNFT : ${invoiceNFTAddress}`);
  console.log(`  USDT       : ${usdtAddress}`);
  console.log(
    `  treasury   : ${treasury}${treasury === deployer.address ? " (deployer fallback)" : ""}`
  );
  console.log("");

  // ── Pre-flight checks: abort before spending gas on a misconfigured deploy ──

  console.log("[1/4] Pre-flight checks...");

  const usdtCode = await ethers.provider.getCode(usdtAddress);
  if (usdtCode === "0x") {
    throw new Error(
      `No bytecode at USDT address ${usdtAddress} on ${hre.network.name}. ` +
        "Check USDT_ADDRESS and that you are pointed at BOT Chain Mainnet (chain 677)."
    );
  }

  const usdt = new ethers.Contract(usdtAddress, ERC20_METADATA_ABI, ethers.provider);
  let usdtDecimals;
  let usdtSymbol = "?";
  try {
    usdtDecimals = Number(await usdt.decimals());
    usdtSymbol = await usdt.symbol();
  } catch (err) {
    throw new Error(
      `Contract at ${usdtAddress} does not expose ERC-20 decimals()/symbol(): ${err.message}`
    );
  }
  if (usdtDecimals !== 6) {
    throw new Error(
      `Settlement token at ${usdtAddress} reports ${usdtDecimals} decimals, but the vault's ` +
        "USD_WAD_PER_TOKEN_UNIT = 1e12 conversion assumes exactly 6. Aborting - a mismatch " +
        "would misprice every invoice."
    );
  }
  console.log(`      token   : ${usdtSymbol}, ${usdtDecimals} decimals - OK`);

  const nftCode = await ethers.provider.getCode(invoiceNFTAddress);
  if (nftCode === "0x") {
    throw new Error(
      `No bytecode at INVOICE_NFT_ADDRESS ${invoiceNFTAddress} on ${hre.network.name}.`
    );
  }

  const invoiceNFT = await ethers.getContractAt("SynturaInvoiceNFT", invoiceNFTAddress, deployer);
  const nftOwner = await invoiceNFT.owner();
  if (ethers.getAddress(nftOwner) !== ethers.getAddress(deployer.address)) {
    throw new Error(
      `Deployer ${deployer.address} is not the SynturaInvoiceNFT owner (${nftOwner}). ` +
        "Only the owner can call setVault, so the migration would leave the NFT pointing at " +
        "the old vault. Aborting before deploying."
    );
  }
  console.log(`      NFT owner matches deployer - OK`);

  const previousVault = await invoiceNFT.vault();
  console.log(`      current vault : ${previousVault}`);

  // ── Deploy the USDT vault ──

  console.log("[2/4] Deploying SynturaVault (USDT-denominated)...");
  const vault = await ethers.deployContract("SynturaVault", [
    invoiceNFTAddress,
    treasury,
    usdtAddress,
  ]);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`      deployed at ${vaultAddress}`);

  // ── Re-point the NFT ──

  console.log("[3/4] Wiring the new vault into SynturaInvoiceNFT...");
  const tx = await invoiceNFT.setVault(vaultAddress);
  const receipt = await tx.wait();
  console.log(`      setVault tx ${receipt.hash} (block ${receipt.blockNumber})`);

  console.log("[4/4] Verifying the pointer...");
  const wired = await invoiceNFT.vault();
  if (ethers.getAddress(wired) !== ethers.getAddress(vaultAddress)) {
    throw new Error(
      `invoiceNFT.vault() reads back ${wired}, expected ${vaultAddress}. Migration incomplete.`
    );
  }
  console.log(`      invoiceNFT.vault() == ${wired} - OK`);

  // ── Summary ──

  const line = "-".repeat(78);
  console.log("");
  console.log(line);
  console.log("  SYNTURA VAULT MIGRATION COMPLETE - SETTLEMENT NOW IN USDT");
  console.log(line);
  console.log(`  New SynturaVault  : ${vaultAddress}`);
  console.log(`  SynturaInvoiceNFT : ${invoiceNFTAddress} (unchanged, still verified)`);
  console.log(`  Settlement token  : ${usdtAddress} (${usdtSymbol}, 6 decimals)`);
  console.log(`  Treasury (3% fee) : ${treasury}`);
  console.log(`  Previous vault    : ${previousVault}`);
  console.log(line);
  console.log("  Verify the new vault source on the explorer:");
  console.log("");
  console.log(
    `  npx hardhat verify --network botchain ${vaultAddress} ${invoiceNFTAddress} ${treasury} ${usdtAddress}`
  );
  console.log(line);
  console.log("  Paste into .env and into the Vercel project environment:");
  console.log("");
  console.log(`  VITE_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`  VITE_USDT_ADDRESS=${usdtAddress}`);
  console.log(line);
  console.log("  WARNING - orphaned liquidity in the old native-BOT vault");
  console.log("");
  console.log(`  The outgoing vault ${OLD_NATIVE_VAULT}`);
  console.log("  still holds any native BOT that providers deposited. The invoice NFT no");
  console.log("  longer points at it, so it can never settle another invoice, but its");
  console.log("  accounting is intact: every provider must call its `withdrawLiquidity`");
  console.log("  (and `withdrawYield`) to recover principal and accrued fees BEFORE that");
  console.log("  balance is forgotten. Do this first - the old vault has no rescue path");
  console.log("  and no owner sweep.");
  console.log(line);
  console.log("");
}

main().catch((err) => {
  console.error("");
  console.error("MIGRATION ABORTED");
  console.error(err.message ?? err);
  process.exitCode = 1;
});
