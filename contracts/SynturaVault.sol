// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @dev Surface of SynturaInvoiceNFT the vault needs: invoice reads + settlement mark.
 */
interface ISynturaInvoiceNFT {
    struct Invoice {
        uint256 invoiceId;
        address supplier;
        string debtorName;
        uint256 faceValueUSD;
        uint256 dueDate;
        uint16 riskScore;
        uint16 discountRateBps;
        bool isUnderwritten;
        bool isSettled;
    }

    function getInvoice(uint256 invoiceId) external view returns (Invoice memory);

    function settleInvoice(uint256 invoiceId) external;
}

/**
 * @title SynturaVault
 * @author Ifeanyichukwu Onwo (mrnetwork)
 * @notice Liquidity pool + streaming escrow + settlement engine for Syntura
 *         RWA invoices on BOTChain, denominated in the bridged USDT stablecoin.
 * @dev Economic flow per invoice:
 *      1. Providers deposit USDT liquidity (`depositLiquidity`).
 *      2. Once an invoice is underwritten, `streamPayout` advances
 *         `(SUPPLIER_SPLIT_BPS - discountRateBps)` of face value from the pool
 *         to the supplier - the AI-quoted discount is the pool's holdback.
 *      3. At maturity the debtor settles face value via `settleInvoice`;
 *         the waterfall splits it 90% supplier / 7% pool / 3% treasury
 *         (the supplier leg is netted against the streamed advance, which
 *         returns the pool's principal).
 *      4. Pool fees accrue pro-rata to providers via a yield-per-share
 *         accumulator; providers pull with `withdrawYield` (pull-over-push).
 *
 *      Units: the invoice NFT stores face value as a USD wad (18 decimals,
 *      $1 = 1e18) and the vault settles in 6-decimal USDT base units, so every
 *      entry point converts once through `USD_WAD_PER_TOKEN_UNIT` and then does
 *      all basis-point maths on token units. All value-moving functions are
 *      non-reentrant, and the vault holds no native balance: there is no
 *      `receive()`, so BOT can only ever reach it by selfdestruct/coinbase.
 */
contract SynturaVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ────────────────────────────────── Constants ────────────────────────────

    /// @notice Basis-point denominator (100%).
    uint256 public constant BPS_DENOMINATOR = 10_000;
    /// @notice Supplier share of the settlement waterfall (90%).
    uint256 public constant SUPPLIER_SPLIT_BPS = 9_000;
    /// @notice Liquidity-pool share of the settlement waterfall (7%).
    uint256 public constant POOL_SPLIT_BPS = 700;
    /// @notice Treasury share of the settlement waterfall (3%).
    uint256 public constant TREASURY_SPLIT_BPS = 300;

    /**
     * @notice USD wad units per settlement-token base unit.
     * @dev The invoice NFT records `faceValueUSD` as a USD-pegged wad with 18
     *      decimals ($1 = 1e18); the bridged USDT on BOTChain has 6 decimals
     *      ($1 = 1e6). Dividing a wad by 1e12 therefore yields token base
     *      units: 1e18 / 1e12 = 1e6. Truncation discards anything below one
     *      micro-dollar (1e-6 USD) of face value, which is the smallest amount
     *      the token can represent and is intentionally dropped rather than
     *      rounded up, so the vault never pulls more than the debtor owes.
     */
    uint256 public constant USD_WAD_PER_TOKEN_UNIT = 1e12;

    /// @dev Fixed-point scale for the yield-per-share accumulator.
    uint256 private constant PRECISION = 1e18;

    // ─────────────────────────────────── Errors ──────────────────────────────

    /// @notice Zero address supplied where a real address is required.
    error ZeroAddress();
    /// @notice Deposit must carry a non-zero amount.
    error ZeroDeposit();
    /// @notice Invoice must be underwritten before streaming or settlement.
    error NotUnderwritten(uint256 invoiceId);
    /// @notice Invoice has already been settled.
    error AlreadySettled(uint256 invoiceId);
    /// @notice Advance has already been streamed for this invoice.
    error AlreadyStreamed(uint256 invoiceId);
    /// @notice Pool lacks available liquidity for the requested amount.
    error InsufficientLiquidity(uint256 requested, uint256 available);
    /// @notice Nothing to withdraw for the caller.
    error NothingToWithdraw();
    /// @notice Withdrawal exceeds the caller's deposited principal.
    error ExceedsDeposit(uint256 requested, uint256 deposited);

    // ─────────────────────────────────── Events ──────────────────────────────

    /// @notice Emitted when a provider deposits pool liquidity.
    /// @param provider Depositing address.
    /// @param amount   Token base units deposited.
    event LiquidityDeposited(address indexed provider, uint256 amount);

    /// @notice Emitted when a provider withdraws deposited principal.
    /// @param provider Withdrawing address.
    /// @param amount   Token base units returned.
    event LiquidityWithdrawn(address indexed provider, uint256 amount);

    /// @notice Emitted when the pool streams an advance to an invoice supplier.
    /// @param invoiceId Invoice being financed.
    /// @param supplier  Supplier receiving the advance.
    /// @param amount    Token base units streamed.
    event PayoutStreamed(uint256 indexed invoiceId, address indexed supplier, uint256 amount);

    /// @notice Emitted when a provider pulls accrued pool-fee yield.
    /// @param provider Withdrawing address.
    /// @param amount   Token base units of yield paid out.
    event YieldWithdrawn(address indexed provider, uint256 amount);

    /// @notice Emitted when a debtor settles an invoice through the vault;
    ///         amounts are the actual token legs paid (supplier leg net of
    ///         any streamed advance).
    /// @param invoiceId      Invoice settled.
    /// @param supplierPayout Net residual paid to the supplier.
    /// @param poolFee        Fee accrued to liquidity providers.
    /// @param treasuryFee    Fee forwarded to the treasury.
    event SettlementExecuted(
        uint256 indexed invoiceId,
        uint256 supplierPayout,
        uint256 poolFee,
        uint256 treasuryFee
    );

    /// @notice Emitted when the owner rotates the treasury address.
    /// @param treasury New treasury address.
    event TreasuryUpdated(address indexed treasury);

    // ─────────────────────────────────── Storage ─────────────────────────────

    /// @notice Invoice NFT collection this vault finances and settles.
    ISynturaInvoiceNFT public immutable invoiceNFT;

    /// @notice Settlement token: the bridged USDT stablecoin on BOTChain (6 decimals).
    IERC20 public immutable token;

    /// @notice Treasury receiving the 3% settlement fee.
    address public treasury;

    /// @notice Deposited principal per provider, in token base units.
    mapping(address => uint256) public depositOf;

    /// @notice Total provider principal in the pool, in token base units.
    uint256 public totalDeposits;

    /// @notice Number of unique providers with an active deposit.
    uint256 public providerCount;

    /// @notice Advance streamed per invoice in token base units (0 when not yet streamed).
    mapping(uint256 => uint256) public streamedOf;

    /// @notice Sum of streamed advances not yet recovered through settlement.
    uint256 public totalOutstandingAdvances;

    /// @notice Lifetime pool fees accrued to providers, in token base units.
    uint256 public totalPoolFeesAccrued;

    /// @dev Accumulated yield per share, scaled by `PRECISION`.
    uint256 private _accYieldPerShare;

    /// @dev Provider checkpoint against `_accYieldPerShare` (MasterChef-style).
    mapping(address => uint256) private _rewardDebt;

    /// @dev Yield settled to a provider but not yet withdrawn.
    mapping(address => uint256) private _storedYield;

    // ───────────────────────────────── Constructor ───────────────────────────

    /**
     * @notice Deploys the vault wired to the invoice collection, treasury and
     *         settlement token.
     * @param invoiceNFT_ Address of the deployed SynturaInvoiceNFT.
     * @param treasury_   Address receiving the 3% settlement fee.
     * @param token_      Address of the 6-decimal bridged USDT stablecoin.
     */
    constructor(address invoiceNFT_, address treasury_, address token_) Ownable(msg.sender) {
        if (invoiceNFT_ == address(0) || treasury_ == address(0) || token_ == address(0)) {
            revert ZeroAddress();
        }
        invoiceNFT = ISynturaInvoiceNFT(invoiceNFT_);
        treasury = treasury_;
        token = IERC20(token_);
    }

    // ─────────────────────────────── Owner actions ───────────────────────────

    /**
     * @notice Rotates the treasury address that receives the 3% settlement fee.
     * @param treasury_ New treasury address.
     */
    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    // ─────────────────────────────── Provider flow ───────────────────────────

    /**
     * @notice Deposits USDT liquidity into the streaming pool.
     * @dev Pulls `amount` via `transferFrom`, so the caller must approve the
     *      vault first. Settles any pending yield to the provider's stored
     *      balance before the principal changes so the new principal only earns
     *      fees accrued after this deposit.
     * @param amount Token base units of principal to deposit.
     */
    function depositLiquidity(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroDeposit();

        token.safeTransferFrom(msg.sender, address(this), amount);

        _settleYield(msg.sender);

        if (depositOf[msg.sender] == 0) {
            unchecked {
                ++providerCount;
            }
        }
        depositOf[msg.sender] += amount;
        totalDeposits += amount;
        _rewardDebt[msg.sender] = (depositOf[msg.sender] * _accYieldPerShare) / PRECISION;

        emit LiquidityDeposited(msg.sender, amount);
    }

    /**
     * @notice Withdraws deposited principal, limited to liquidity not currently
     *         financing outstanding advances.
     * @param amount Token base units of principal to withdraw.
     */
    function withdrawLiquidity(uint256 amount) external nonReentrant {
        uint256 deposited = depositOf[msg.sender];
        if (amount == 0 || deposited == 0) revert NothingToWithdraw();
        if (amount > deposited) revert ExceedsDeposit(amount, deposited);
        uint256 available = availableLiquidity();
        if (amount > available) revert InsufficientLiquidity(amount, available);

        _settleYield(msg.sender);

        depositOf[msg.sender] = deposited - amount;
        totalDeposits -= amount;
        if (depositOf[msg.sender] == 0) {
            unchecked {
                --providerCount;
            }
        }
        _rewardDebt[msg.sender] = (depositOf[msg.sender] * _accYieldPerShare) / PRECISION;

        token.safeTransfer(msg.sender, amount);
        emit LiquidityWithdrawn(msg.sender, amount);
    }

    /**
     * @notice Pulls the caller's accrued pool-fee yield (pull-over-push).
     */
    function withdrawYield() external nonReentrant {
        _settleYield(msg.sender);

        uint256 amount = _storedYield[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        _storedYield[msg.sender] = 0;

        token.safeTransfer(msg.sender, amount);
        emit YieldWithdrawn(msg.sender, amount);
    }

    // ─────────────────────────────── Streaming flow ──────────────────────────

    /**
     * @notice Streams the pool's advance to the supplier of an underwritten,
     *         unsettled invoice. Permissionless to trigger: underwriting by a
     *         verified sentry is the authorization, and funds can only flow to
     *         the invoice's onchain supplier.
     * @dev Advance = faceUnits * (SUPPLIER_SPLIT_BPS - discountRateBps) / 10 000,
     *      where `faceUnits` is the face-value wad converted to token base units
     *      once, up front. Streamable once per invoice and bounded by available
     *      liquidity.
     * @param invoiceId Invoice to finance.
     */
    function streamPayout(uint256 invoiceId) external nonReentrant {
        ISynturaInvoiceNFT.Invoice memory inv = invoiceNFT.getInvoice(invoiceId);
        if (!inv.isUnderwritten) revert NotUnderwritten(invoiceId);
        if (inv.isSettled) revert AlreadySettled(invoiceId);
        if (streamedOf[invoiceId] != 0) revert AlreadyStreamed(invoiceId);

        uint256 faceUnits = inv.faceValueUSD / USD_WAD_PER_TOKEN_UNIT;
        uint256 advance =
            (faceUnits * (SUPPLIER_SPLIT_BPS - inv.discountRateBps)) / BPS_DENOMINATOR;
        uint256 available = availableLiquidity();
        if (advance == 0 || advance > available) {
            revert InsufficientLiquidity(advance, available);
        }

        streamedOf[invoiceId] = advance;
        totalOutstandingAdvances += advance;

        token.safeTransfer(inv.supplier, advance);
        emit PayoutStreamed(invoiceId, inv.supplier, advance);
    }

    // ────────────────────────────── Settlement flow ──────────────────────────

    /**
     * @notice Settles an invoice: the vault pulls face value in USDT from the
     *         debtor and splits it 90% supplier / 7% pool / 3% treasury. The
     *         supplier leg is netted against any streamed advance, returning
     *         pool principal.
     * @dev The exact amount pulled is `faceValueUnits(invoiceId)`; the caller
     *      must have approved at least that much, and an insufficient allowance
     *      or balance surfaces as the token's own revert. Marks the invoice
     *      settled on the NFT (emitting its gross waterfall event) before moving
     *      value; all transfers go through SafeERC20.
     * @param invoiceId Invoice being repaid.
     */
    function settleInvoice(uint256 invoiceId) external nonReentrant {
        ISynturaInvoiceNFT.Invoice memory inv = invoiceNFT.getInvoice(invoiceId);
        if (!inv.isUnderwritten) revert NotUnderwritten(invoiceId);
        if (inv.isSettled) revert AlreadySettled(invoiceId);

        uint256 faceUnits = inv.faceValueUSD / USD_WAD_PER_TOKEN_UNIT;
        token.safeTransferFrom(msg.sender, address(this), faceUnits);

        uint256 grossSupplier = (faceUnits * SUPPLIER_SPLIT_BPS) / BPS_DENOMINATOR;
        uint256 poolFee = (faceUnits * POOL_SPLIT_BPS) / BPS_DENOMINATOR;
        uint256 treasuryFee = faceUnits - grossSupplier - poolFee; // absorbs rounding dust

        // Advance <= 90% of faceUnits by construction, so the residual never underflows.
        uint256 streamed = streamedOf[invoiceId];
        uint256 supplierPayout = grossSupplier - streamed;
        totalOutstandingAdvances -= streamed;

        _accruePoolFee(poolFee);
        invoiceNFT.settleInvoice(invoiceId);

        if (supplierPayout != 0) token.safeTransfer(inv.supplier, supplierPayout);
        if (treasuryFee != 0) token.safeTransfer(treasury, treasuryFee);

        emit SettlementExecuted(invoiceId, supplierPayout, poolFee, treasuryFee);
    }

    // ──────────────────────────────────── Views ──────────────────────────────

    /**
     * @notice Total provider principal currently deposited in the pool.
     * @return Token base units of pooled principal.
     */
    function totalLiquidity() external view returns (uint256) {
        return totalDeposits;
    }

    /**
     * @notice Pool principal not currently financing outstanding advances.
     * @return Token base units available for streaming or principal withdrawal.
     */
    function availableLiquidity() public view returns (uint256) {
        return totalDeposits - totalOutstandingAdvances;
    }

    /**
     * @notice Accrued, withdrawable pool-fee yield of a provider.
     * @param provider Provider address to read.
     * @return Token base units claimable via `withdrawYield`.
     */
    function yieldOf(address provider) external view returns (uint256) {
        uint256 pending =
            (depositOf[provider] * _accYieldPerShare) / PRECISION - _rewardDebt[provider];
        return _storedYield[provider] + pending;
    }

    /**
     * @notice Exact settlement amount for an invoice in settlement-token base
     *         units, so the frontend and the sentry service never duplicate the
     *         wad-to-USDT conversion.
     * @param invoiceId Invoice token id to read.
     * @return Face value converted to token base units.
     */
    function faceValueUnits(uint256 invoiceId) external view returns (uint256) {
        return invoiceNFT.getInvoice(invoiceId).faceValueUSD / USD_WAD_PER_TOKEN_UNIT;
    }

    // ─────────────────────────────────── Internal ────────────────────────────

    /// @dev Moves a provider's pending accumulator yield into stored balance
    ///      and re-checkpoints their reward debt.
    function _settleYield(address provider) private {
        uint256 pending =
            (depositOf[provider] * _accYieldPerShare) / PRECISION - _rewardDebt[provider];
        if (pending != 0) {
            _storedYield[provider] += pending;
        }
        _rewardDebt[provider] = (depositOf[provider] * _accYieldPerShare) / PRECISION;
    }

    /// @dev Distributes a settlement pool fee pro-rata across current deposits;
    ///      with no providers the fee is forwarded to the treasury instead of
    ///      being stranded.
    function _accruePoolFee(uint256 fee) private {
        if (fee == 0) return;
        if (totalDeposits == 0) {
            token.safeTransfer(treasury, fee);
            return;
        }
        _accYieldPerShare += (fee * PRECISION) / totalDeposits;
        totalPoolFeesAccrued += fee;
    }
}
