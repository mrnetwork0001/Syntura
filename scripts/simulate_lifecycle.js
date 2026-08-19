/**
 * Syntura USDT vault lifecycle simulation - LOCAL HARDHAT NETWORK ONLY.
 *
 * Proves the migrated SynturaVault end to end against a 6-decimal MockUSDT:
 * deposit -> mint -> underwrite -> stream -> settle -> withdraw yield ->
 * withdraw principal, asserting every amount in token base units.
 *
 * Unit model: the NFT stores face value as an 18-decimal USD wad ($1 = 1e18);
 * the vault divides by USD_WAD_PER_TOKEN_UNIT (1e12) to get 6-decimal USDT
 * base units. A $5.00 invoice is 5e18 wad and settles for 5_000_000 units.
 *
 * Usage: npm run simulate
 *        (hardhat run scripts/simulate_lifecycle.js)
 */
import assert from "node:assert/strict";
import hre from "hardhat";

const { ethers } = hre;

// ───────────────────────────────── Parameters ──────────────────────────────

/** USD wad units per USDT base unit (mirrors the vault constant). */
const USD_WAD_PER_TOKEN_UNIT = 10n ** 12n;
/** One USDT in base units (6 decimals). */
const ONE_USDT = 1_000_000n;

const BPS_DENOMINATOR = 10_000n;
const SUPPLIER_SPLIT_BPS = 9_000n;
const POOL_SPLIT_BPS = 700n;

/** $5.00 invoice, expressed as the NFT's 18-decimal USD wad. */
const FACE_WAD = 5n * 10n ** 18n;
/** LP seeds the pool with 10.00 USDT. */
const LP_DEPOSIT = 10n * ONE_USDT;
/** Debtor is funded with 25.00 USDT so the settlement pull is comfortably covered. */
const DEBTOR_FUNDING = 25n * ONE_USDT;
/** MockUSDT initial supply minted to the deployer: 1,000,000.00 USDT. */
const MOCK_SUPPLY = 1_000_000n * ONE_USDT;

/** Sentry underwriting quote: risk 82/100, 2.50% discount. */
const RISK_SCORE = 82;
const DISCOUNT_BPS = 250n;
const SENTRY_MODEL_ID = "syntura-sentry-v1";

/** Rounding-dust tolerance for residual token balance left in the vault. */
const DUST_TOLERANCE = 10n;

// ─────────────────────────────── Expected maths ────────────────────────────

const FACE_UNITS = FACE_WAD / USD_WAD_PER_TOKEN_UNIT; // 5_000_000
const EXPECTED_ADVANCE =
  (FACE_UNITS * (SUPPLIER_SPLIT_BPS - DISCOUNT_BPS)) / BPS_DENOMINATOR; // 4_375_000
const EXPECTED_GROSS_SUPPLIER = (FACE_UNITS * SUPPLIER_SPLIT_BPS) / BPS_DENOMINATOR; // 4_500_000
const EXPECTED_POOL_FEE = (FACE_UNITS * POOL_SPLIT_BPS) / BPS_DENOMINATOR; // 350_000
const EXPECTED_TREASURY_FEE = FACE_UNITS - EXPECTED_GROSS_SUPPLIER - EXPECTED_POOL_FEE; // 150_000
const EXPECTED_RESIDUAL = EXPECTED_GROSS_SUPPLIER - EXPECTED_ADVANCE; // 125_000

// ──────────────────────────────── Reporting ────────────────────────────────

const rows = [];

/** Format token base units as a human USDT figure. */
function usdt(units) {
  return `${ethers.formatUnits(units, 6)} USDT`;
}

/** Assert two token amounts are equal and record the check in the summary. */
function check(label, actual, expected) {
  record(label, actual, expected, "money");
}

/** Assert a non-monetary numeric (counter, constant, bps) and record it. */
function checkRaw(label, actual, expected) {
  record(label, actual, expected, "raw");
}

/** Assert a boolean or address value and record it. */
function checkFlag(label, actual, expected) {
  record(label, actual, expected, "raw");
}

/** Shared assert + record helper. */
function record(label, actual, expected, kind) {
  rows.push({ label, expected, actual, ok: actual === expected, kind });
  const suffix = kind === "money" ? " base units" : "";
  assert.equal(actual, expected, `${label}: expected ${expected}${suffix}, got ${actual}`);
}

/** Print the pass/fail summary table of every asserted amount. */
function printSummary() {
  const line = "-".repeat(88);
  const labelWidth = Math.max(...rows.map((r) => r.label.length));
  console.log("");
  console.log(line);
  console.log("  SYNTURA USDT LIFECYCLE - ASSERTED VALUES (money rows are 6-decimal base units)");
  console.log(line);
  for (const r of rows) {
    const mark = r.ok ? "PASS" : "FAIL";
    const value = r.kind === "money" ? `${r.actual} (${usdt(r.actual)})` : String(r.actual);
    console.log(`  [${mark}] ${r.label.padEnd(labelWidth)}  ${value}`);
  }
  console.log(line);
  console.log(`  ${rows.length} assertions, ${rows.filter((r) => r.ok).length} passed`);
  console.log(line);
  console.log("");
}

// ────────────────────────────────── Scenario ───────────────────────────────

async function main() {
  const net = await ethers.provider.getNetwork();
  assert.equal(
    hre.network.name,
    "hardhat",
    `simulation must run on the in-process hardhat network, got "${hre.network.name}"`
  );

  const [deployer, supplier, lp, debtor, treasury, sentry] = await ethers.getSigners();

  console.log("");
  console.log("Syntura vault lifecycle simulation - local hardhat network");
  console.log(`  network  : ${hre.network.name} (chainId ${net.chainId})`);
  console.log(`  deployer : ${deployer.address}`);
  console.log(`  supplier : ${supplier.address}`);
  console.log(`  provider : ${lp.address}`);
  console.log(`  debtor   : ${debtor.address}`);
  console.log(`  treasury : ${treasury.address}`);
  console.log(`  sentry   : ${sentry.address}`);
  console.log("");

  // [1] Deploy the stack.
  console.log("[1/9] Deploying MockUSDT, registry, invoice NFT and vault...");
  const usdtToken = await ethers.deployContract("MockUSDT", [MOCK_SUPPLY]);
  await usdtToken.waitForDeployment();
  const usdtAddress = await usdtToken.getAddress();

  const registry = await ethers.deployContract("SynturaSentryRegistry");
  await registry.waitForDeployment();

  const invoiceNFT = await ethers.deployContract("SynturaInvoiceNFT", [
    await registry.getAddress(),
  ]);
  await invoiceNFT.waitForDeployment();

  const vault = await ethers.deployContract("SynturaVault", [
    await invoiceNFT.getAddress(),
    treasury.address,
    usdtAddress,
  ]);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();

  await (await invoiceNFT.setVault(vaultAddress)).wait();
  await (await registry.registerSentry(sentry.address, SENTRY_MODEL_ID)).wait();

  console.log(`      MockUSDT              : ${usdtAddress} (decimals ${await usdtToken.decimals()})`);
  console.log(`      SynturaSentryRegistry : ${await registry.getAddress()}`);
  console.log(`      SynturaInvoiceNFT     : ${await invoiceNFT.getAddress()}`);
  console.log(`      SynturaVault          : ${vaultAddress}`);

  checkRaw("token decimals", BigInt(await usdtToken.decimals()), 6n);
  checkRaw("vault USD_WAD_PER_TOKEN_UNIT", await vault.USD_WAD_PER_TOKEN_UNIT(), USD_WAD_PER_TOKEN_UNIT);
  checkFlag("invoiceNFT.vault() points at new vault", await invoiceNFT.vault(), vaultAddress);
  checkFlag("sentry is verified", await registry.isVerifiedSentry(sentry.address), true);

  // [2] Fund the LP and the debtor, then approve the vault.
  console.log("[2/9] Funding provider and debtor with MockUSDT, approving vault...");
  await (await usdtToken.transfer(lp.address, LP_DEPOSIT)).wait();
  await (await usdtToken.transfer(debtor.address, DEBTOR_FUNDING)).wait();
  await (await usdtToken.connect(lp).approve(vaultAddress, LP_DEPOSIT)).wait();

  check("LP funded balance", await usdtToken.balanceOf(lp.address), LP_DEPOSIT);
  check("debtor funded balance", await usdtToken.balanceOf(debtor.address), DEBTOR_FUNDING);

  // [3] Deposit liquidity.
  console.log("[3/9] Provider deposits liquidity...");
  await (await vault.connect(lp).depositLiquidity(LP_DEPOSIT)).wait();

  check("vault totalLiquidity after deposit", await vault.totalLiquidity(), LP_DEPOSIT);
  check("vault availableLiquidity after deposit", await vault.availableLiquidity(), LP_DEPOSIT);
  check("LP depositOf", await vault.depositOf(lp.address), LP_DEPOSIT);
  checkRaw("vault providerCount", await vault.providerCount(), 1n);
  check("LP balance after deposit", await usdtToken.balanceOf(lp.address), 0n);
  check("vault token balance after deposit", await usdtToken.balanceOf(vaultAddress), LP_DEPOSIT);

  // [4] Supplier mints a $5.00 invoice.
  console.log("[4/9] Supplier mints a $5.00 invoice (5e18 USD wad)...");
  const latest = await ethers.provider.getBlock("latest");
  const dueDate = BigInt(latest.timestamp) + 30n * 24n * 60n * 60n; // 30 days out
  const metadata = JSON.stringify({
    name: "Syntura RWA Invoice #1",
    description: "Tokenized receivable settled in bridged USDT on BOT Chain.",
    debtor: "Helio Freight Ltd",
    faceValueUSD: "5.00",
    settlementToken: "USDT",
    settlementDecimals: 6,
    dueDate: Number(dueDate),
  });
  const metadataURI = `data:application/json;base64,${Buffer.from(metadata).toString("base64")}`;

  await (
    await invoiceNFT
      .connect(supplier)
      .mintInvoice("Helio Freight Ltd", FACE_WAD, dueDate, metadataURI)
  ).wait();
  const invoiceId = await invoiceNFT.totalInvoices();

  checkRaw("minted invoiceId", invoiceId, 1n);
  checkRaw("NFT faceValueUSD (wad)", (await invoiceNFT.getInvoice(invoiceId)).faceValueUSD, FACE_WAD);
  check("vault faceValueUnits(invoiceId)", await vault.faceValueUnits(invoiceId), FACE_UNITS);

  // [5] Sentry underwrites.
  console.log(`[5/9] Sentry underwrites (risk ${RISK_SCORE}, discount ${DISCOUNT_BPS} bps)...`);
  const auditHash = ethers.keccak256(
    ethers.toUtf8Bytes(`${SENTRY_MODEL_ID}:${invoiceId}:${RISK_SCORE}:${DISCOUNT_BPS}`)
  );
  await (
    await invoiceNFT
      .connect(sentry)
      .underwriteInvoice(invoiceId, RISK_SCORE, DISCOUNT_BPS, auditHash)
  ).wait();
  await (await registry.connect(sentry).commitRiskScore(invoiceId, RISK_SCORE, auditHash)).wait();

  const underwritten = await invoiceNFT.getInvoice(invoiceId);
  checkFlag("invoice isUnderwritten", underwritten.isUnderwritten, true);
  checkRaw("invoice discountRateBps", BigInt(underwritten.discountRateBps), DISCOUNT_BPS);

  // [6] Stream the advance.
  console.log("[6/9] Streaming the advance to the supplier...");
  const supplierBefore = await usdtToken.balanceOf(supplier.address);
  await (await vault.connect(deployer).streamPayout(invoiceId)).wait();
  const supplierAfterStream = await usdtToken.balanceOf(supplier.address);

  check("supplier received advance", supplierAfterStream - supplierBefore, EXPECTED_ADVANCE);
  check("vault streamedOf(invoiceId)", await vault.streamedOf(invoiceId), EXPECTED_ADVANCE);
  check("totalOutstandingAdvances after stream", await vault.totalOutstandingAdvances(), EXPECTED_ADVANCE);
  check(
    "availableLiquidity after stream",
    await vault.availableLiquidity(),
    LP_DEPOSIT - EXPECTED_ADVANCE
  );
  check("totalLiquidity unchanged by stream", await vault.totalLiquidity(), LP_DEPOSIT);

  // [7] Debtor settles the face amount.
  console.log("[7/9] Debtor approves and settles the invoice...");
  const settlementUnits = await vault.faceValueUnits(invoiceId);
  await (await usdtToken.connect(debtor).approve(vaultAddress, settlementUnits)).wait();

  const debtorBefore = await usdtToken.balanceOf(debtor.address);
  const treasuryBefore = await usdtToken.balanceOf(treasury.address);
  await (await vault.connect(debtor).settleInvoice(invoiceId)).wait();
  const debtorAfter = await usdtToken.balanceOf(debtor.address);
  const supplierAfterSettle = await usdtToken.balanceOf(supplier.address);
  const treasuryAfter = await usdtToken.balanceOf(treasury.address);

  check("vault pulled exactly face amount from debtor", debtorBefore - debtorAfter, FACE_UNITS);
  check("debtor residual allowance consumed", await usdtToken.allowance(debtor.address, vaultAddress), 0n);
  check("supplier residual leg at settlement", supplierAfterSettle - supplierAfterStream, EXPECTED_RESIDUAL);
  check("supplier total = 90% of face", supplierAfterSettle - supplierBefore, EXPECTED_GROSS_SUPPLIER);
  check("treasury received 3% of face", treasuryAfter - treasuryBefore, EXPECTED_TREASURY_FEE);
  check("LP claimable yield = 7% of face", await vault.yieldOf(lp.address), EXPECTED_POOL_FEE);
  check("totalPoolFeesAccrued", await vault.totalPoolFeesAccrued(), EXPECTED_POOL_FEE);
  check("totalOutstandingAdvances back to zero", await vault.totalOutstandingAdvances(), 0n);
  check("availableLiquidity restored to principal", await vault.availableLiquidity(), LP_DEPOSIT);
  checkFlag("invoice isSettled on the NFT", (await invoiceNFT.getInvoice(invoiceId)).isSettled, true);
  check(
    "vault token balance = principal + yield",
    await usdtToken.balanceOf(vaultAddress),
    LP_DEPOSIT + EXPECTED_POOL_FEE
  );

  // [8] LP pulls yield.
  console.log("[8/9] Provider withdraws accrued yield...");
  await (await vault.connect(lp).withdrawYield()).wait();

  check("LP balance after withdrawYield", await usdtToken.balanceOf(lp.address), EXPECTED_POOL_FEE);
  check("LP yieldOf after withdrawal", await vault.yieldOf(lp.address), 0n);
  check(
    "vault token balance after yield pull",
    await usdtToken.balanceOf(vaultAddress),
    LP_DEPOSIT
  );

  // [9] LP pulls the remaining principal.
  console.log("[9/9] Provider withdraws remaining principal...");
  await (await vault.connect(lp).withdrawLiquidity(LP_DEPOSIT)).wait();

  check(
    "LP balance after withdrawLiquidity",
    await usdtToken.balanceOf(lp.address),
    LP_DEPOSIT + EXPECTED_POOL_FEE
  );
  check("LP depositOf after exit", await vault.depositOf(lp.address), 0n);
  checkRaw("providerCount after exit", await vault.providerCount(), 0n);
  check("totalLiquidity after exit", await vault.totalLiquidity(), 0n);

  // Nothing stranded: the vault must be empty to the last base unit.
  const dust = await usdtToken.balanceOf(vaultAddress);
  check("vault residual dust (exactly 0 units)", dust, 0n);
  assert.ok(
    dust < DUST_TOLERANCE,
    `stranded dust ${dust} base units exceeds the ${DUST_TOLERANCE}-unit tolerance`
  );

  // Conservation: every base unit the debtor paid landed in a real pocket.
  check(
    "conservation: supplier + treasury + LP yield = face",
    EXPECTED_GROSS_SUPPLIER + EXPECTED_TREASURY_FEE + EXPECTED_POOL_FEE,
    FACE_UNITS
  );

  printSummary();
  console.log("Dust check: residual vault balance is exactly 0 base units (tolerance < 10).");
  console.log("ALL ASSERTIONS PASSED - vault settles in 6-decimal USDT as specified.");
  console.log("");
}

main().catch((err) => {
  if (rows.length > 0) printSummary();
  console.error("SIMULATION FAILED");
  console.error(err);
  process.exitCode = 1;
});
