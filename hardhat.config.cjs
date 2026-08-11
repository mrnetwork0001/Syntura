// Hardhat config for the Syntura protocol (CJS — the package itself is ESM).
require("@nomicfoundation/hardhat-ethers");
require("dotenv").config();

const { BOTCHAIN_RPC_URL, BOTCHAIN_CHAIN_ID, PRIVATE_KEY } = process.env;

// Only wire the deployer key when a real 32-byte hex key is configured, so
// `npx hardhat compile` works out of the box without a populated .env.
const accounts =
  PRIVATE_KEY && /^0x[0-9a-fA-F]{64}$/.test(PRIVATE_KEY) ? [PRIVATE_KEY] : [];

// BOT Chain Mainnet is chain 677 (0x2a5) — verified live via eth_chainId.
const chainId = Number(BOTCHAIN_CHAIN_ID || 677);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun", // OZ v5 uses mcopy; hardhat defaults 0.8.24 to pre-Cancun
    },
  },
  networks: {
    botchain: {
      url: BOTCHAIN_RPC_URL || "https://rpc.botchain.ai",
      ...(chainId ? { chainId } : {}),
      accounts,
    },
  },
};
