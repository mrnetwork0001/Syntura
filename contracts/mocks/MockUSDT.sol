// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDT
 * @author Ifeanyichukwu Onwo (mrnetwork)
 * @notice Minimal 6-decimal ERC-20 standing in for the bridged USDT stablecoin
 *         on BOT Chain (0xababc7ddc03e501d190c676bf3d92ef0e6e87a3c).
 * @dev TEST FIXTURE ONLY. This contract exists so the vault lifecycle can be
 *      simulated on the local hardhat network; it has an unrestricted public
 *      `mint` and is never deployed to BOTChain Mainnet or any public network.
 */
contract MockUSDT is ERC20 {
    /// @dev USDT-style precision: 6 decimals, so $1 = 1e6 base units.
    uint8 private constant DECIMALS = 6;

    /**
     * @notice Deploys the mock and mints the initial supply to the deployer.
     * @param initialSupply Base units minted to `msg.sender` (6 decimals).
     */
    constructor(uint256 initialSupply) ERC20("Mock Bridged USDT", "USDT") {
        if (initialSupply != 0) {
            _mint(msg.sender, initialSupply);
        }
    }

    /**
     * @notice Token decimals, matching the bridged USDT on BOT Chain.
     * @return Always 6.
     */
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /**
     * @notice Mints test tokens to any address. Unrestricted by design - this is
     *         a local test fixture, never a production token.
     * @param to     Recipient of the minted tokens.
     * @param amount Base units to mint (6 decimals).
     */
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}
