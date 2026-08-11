/**
 * Syntura protocol deployment — BOTChain Mainnet.
 *
 * Order: SynturaSentryRegistry → SynturaInvoiceNFT(registry) →
 * SynturaVault(invoiceNFT, treasury) → wire vault into the NFT →
 * register the deployer as the demo AI sentry.
 *
 * Usage: npm run deploy:botchain
 *        (hardhat run scripts/deploy_syntura.js --network botchain)
 */
import hre from "hardhat";

const { ethers } = hre;

/** Resolve the sentry model id from the AI agent module, with a safe fallback. */
async function resolveSentryModelId() {
  try {
    const mod = await import("../src/agent/aiSentryAgent.js");
    if (typeof mod?.SENTRY_MODEL_ID === "string" && mod.SENTRY_MODEL_ID) {
      return mod.SENTRY_MODEL_ID;
    }
  } catch {
    // Agent module unavailable in this context — use the canonical id.
  }
  return "syntura-sentry-v1";
}

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error(
      "No deployer account. Set PRIVATE_KEY in .env (see .env.example)."
    );
  }

  const network = await ethers.provider.getNetwork();
  const balance = await ethers.provider.getBalance(deployer.address);

  const treasury =
    process.env.TREASURY_ADDRESS && ethers.isAddress(process.env.TREASURY_ADDRESS)
      ? ethers.getAddress(process.env.TREASURY_ADDRESS)
      : deployer.address;

  console.log("");
  console.log("Syntura Protocol — deploying to BOTChain");
  console.log(`  network : ${hre.network.name} (chainId ${network.chainId})`);
  console.log(`  deployer: ${deployer.address}`);
  console.log(`  balance : ${ethers.formatEther(balance)} BOT`);
  console.log(`  treasury: ${treasury}${treasury === deployer.address ? " (deployer fallback)" : ""}`);
  console.log("");

  console.log("[1/5] Deploying SynturaSentryRegistry…");
  const registry = await ethers.deployContract("SynturaSentryRegistry");
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log(`      ✔ ${registryAddress}`);

  console.log("[2/5] Deploying SynturaInvoiceNFT (SYNV)…");
  const invoiceNFT = await ethers.deployContract("SynturaInvoiceNFT", [
    registryAddress,
  ]);
  await invoiceNFT.waitForDeployment();
  const invoiceNFTAddress = await invoiceNFT.getAddress();
  console.log(`      ✔ ${invoiceNFTAddress}`);

  console.log("[3/5] Deploying SynturaVault…");
  const vault = await ethers.deployContract("SynturaVault", [
    invoiceNFTAddress,
    treasury,
  ]);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`      ✔ ${vaultAddress}`);

  console.log("[4/5] Wiring vault into SynturaInvoiceNFT…");
  await (await invoiceNFT.setVault(vaultAddress)).wait();
  console.log(`      ✔ invoiceNFT.setVault(${vaultAddress})`);

  const modelId = await resolveSentryModelId();
  console.log(`[5/5] Registering deployer as demo AI sentry ("${modelId}")…`);
  await (await registry.registerSentry(deployer.address, modelId)).wait();
  console.log(`      ✔ sentry verified: ${deployer.address}`);

  const line = "─".repeat(72);
  console.log("");
  console.log(line);
  console.log("  SYNTURA PROTOCOL — DEPLOYMENT COMPLETE");
  console.log(line);
  console.log(`  SynturaSentryRegistry : ${registryAddress}`);
  console.log(`  SynturaInvoiceNFT     : ${invoiceNFTAddress}`);
  console.log(`  SynturaVault          : ${vaultAddress}`);
  console.log(`  Treasury (3% fee)     : ${treasury}`);
  console.log(`  Demo sentry           : ${deployer.address} (${modelId})`);
  console.log(line);
  console.log("  Paste into .env to switch the dApp to Live · BOTChain:");
  console.log("");
  console.log(`  VITE_INVOICE_NFT_ADDRESS=${invoiceNFTAddress}`);
  console.log(`  VITE_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`  VITE_SENTRY_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(line);
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
