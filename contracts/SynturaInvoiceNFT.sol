// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @dev Minimal view surface of the Syntura sentry registry needed for gating.
 */
interface ISynturaSentryRegistry {
    function isVerifiedSentry(address agent) external view returns (bool);
}

/**
 * @title SynturaInvoiceNFT
 * @author Ifeanyichukwu Onwo (mrnetwork)
 * @notice ERC-721 "Syntura RWA Invoice" (SYNV) — each token is a tokenized
 *         real-world invoice receivable, minted by its supplier, underwritten
 *         by a verified AI Risk Sentry, and settled through the Syntura vault.
 * @dev Lifecycle: mint (supplier) → underwrite (verified sentry / owner) →
 *      settle (vault / owner). Face values are denominated in the protocol's
 *      USD-pegged notional unit (18 decimals), mirrored 1:1 by the vault's
 *      native-currency escrow on BOTChain. The `supplier` field tracks the
 *      current token owner so streamed payouts always reach the invoice holder.
 */
contract SynturaInvoiceNFT is ERC721, ERC721URIStorage, Ownable {
    // ─────────────────────────────────── Types ───────────────────────────────

    /// @notice On-chain record of a tokenized invoice.
    struct Invoice {
        /// @dev Token id (1-based, sequential).
        uint256 invoiceId;
        /// @dev Current beneficiary of the receivable (kept in sync with token owner).
        address supplier;
        /// @dev Display name of the paying debtor.
        string debtorName;
        /// @dev Face value in USD-pegged notional units (18 decimals).
        uint256 faceValueUSD;
        /// @dev Unix timestamp the invoice falls due.
        uint256 dueDate;
        /// @dev AI risk score 0-100 (higher = safer); 0 until underwritten.
        uint16 riskScore;
        /// @dev Discount rate in basis points charged to the supplier.
        uint16 discountRateBps;
        /// @dev True once a verified sentry has underwritten the invoice.
        bool isUnderwritten;
        /// @dev True once the debtor has settled through the vault.
        bool isSettled;
    }

    // ────────────────────────────────── Constants ────────────────────────────

    /// @notice Basis-point denominator (100%).
    uint16 public constant BPS_DENOMINATOR = 10_000;
    /// @notice Supplier share of the settlement waterfall (90%).
    uint16 public constant SUPPLIER_SPLIT_BPS = 9_000;
    /// @notice Liquidity-pool share of the settlement waterfall (7%).
    uint16 public constant POOL_SPLIT_BPS = 700;
    /// @notice Treasury share of the settlement waterfall (3%).
    uint16 public constant TREASURY_SPLIT_BPS = 300;
    /// @notice Sanity ceiling for sentry-quoted discount rates (50%).
    uint16 public constant MAX_DISCOUNT_BPS = 5_000;

    // ─────────────────────────────────── Errors ──────────────────────────────

    /// @notice No invoice exists with the given id.
    error InvoiceNotFound(uint256 invoiceId);
    /// @notice Caller is neither a verified sentry nor the protocol owner.
    error NotSentryOrOwner(address caller);
    /// @notice Caller is neither the vault nor the protocol owner.
    error NotVault(address caller);
    /// @notice Invoice is already underwritten.
    error AlreadyUnderwritten(uint256 invoiceId);
    /// @notice Invoice has already been settled.
    error AlreadySettled(uint256 invoiceId);
    /// @notice Invoice must be underwritten before this action.
    error NotUnderwritten(uint256 invoiceId);
    /// @notice Risk score exceeds the 0-100 scale.
    error RiskScoreOutOfRange(uint16 riskScore);
    /// @notice Discount rate exceeds `MAX_DISCOUNT_BPS`.
    error DiscountRateTooHigh(uint16 discountRateBps);
    /// @notice Zero audit hash supplied — underwriting must carry a commitment.
    error EmptyAuditHash();
    /// @notice Empty debtor name supplied.
    error EmptyDebtorName();
    /// @notice Face value must be non-zero.
    error ZeroFaceValue();
    /// @notice Due date must be in the future at mint time.
    error DueDateInPast(uint256 dueDate);
    /// @notice Zero address supplied where a contract address is required.
    error ZeroAddress();

    // ─────────────────────────────────── Events ──────────────────────────────

    /// @notice Emitted when a supplier tokenizes an invoice.
    /// @param invoiceId    Newly minted token id.
    /// @param supplier     Supplier the token was minted to.
    /// @param faceValueUSD Face value in USD-pegged notional units.
    /// @param dueDate      Unix timestamp the invoice falls due.
    event InvoiceMinted(
        uint256 indexed invoiceId,
        address indexed supplier,
        uint256 faceValueUSD,
        uint256 dueDate
    );

    /// @notice Emitted when a verified sentry underwrites an invoice.
    /// @param invoiceId       Token id underwritten.
    /// @param riskScore       AI risk score 0-100 (higher = safer).
    /// @param discountRateBps Discount rate quoted, in basis points.
    /// @param auditHash       Deterministic commitment over the model run.
    event InvoiceUnderwritten(
        uint256 indexed invoiceId,
        uint16 riskScore,
        uint16 discountRateBps,
        bytes32 auditHash
    );

    /// @notice Emitted when an invoice is settled; amounts are the gross 90/7/3
    ///         waterfall over face value (the vault nets the supplier leg
    ///         against any advance it already streamed).
    /// @param invoiceId     Token id settled.
    /// @param supplierPayout Gross supplier share (90% of face value).
    /// @param poolFee        Liquidity-pool share (7% of face value).
    /// @param treasuryFee    Treasury share (3% of face value + rounding dust).
    event InvoiceSettled(
        uint256 indexed invoiceId,
        uint256 supplierPayout,
        uint256 poolFee,
        uint256 treasuryFee
    );

    /// @notice Emitted when the owner wires a new vault address.
    /// @param vault New vault contract address.
    event VaultUpdated(address indexed vault);

    // ─────────────────────────────────── Storage ─────────────────────────────

    /// @notice Sentry registry consulted for underwriting authorization.
    ISynturaSentryRegistry public immutable sentryRegistry;

    /// @notice Syntura vault authorized to settle invoices.
    address public vault;

    /// @notice Number of invoices minted so far (also the highest token id).
    uint256 public totalInvoices;

    /// @dev Invoice records by token id.
    mapping(uint256 => Invoice) private _invoices;

    /// @notice Underwriting audit hash by invoice id (bytes32(0) until underwritten).
    mapping(uint256 => bytes32) public auditHashOf;

    // ────────────────────────────────── Modifiers ────────────────────────────

    /// @dev Reverts unless the invoice id maps to a minted token.
    modifier invoiceExists(uint256 invoiceId) {
        if (invoiceId == 0 || invoiceId > totalInvoices) revert InvoiceNotFound(invoiceId);
        _;
    }

    // ───────────────────────────────── Constructor ───────────────────────────

    /**
     * @notice Deploys the SYNV collection wired to a sentry registry.
     * @param registry Address of the deployed SynturaSentryRegistry.
     */
    constructor(address registry)
        ERC721("Syntura RWA Invoice", "SYNV")
        Ownable(msg.sender)
    {
        if (registry == address(0)) revert ZeroAddress();
        sentryRegistry = ISynturaSentryRegistry(registry);
    }

    // ─────────────────────────────── Owner actions ───────────────────────────

    /**
     * @notice Wires the Syntura vault authorized to settle invoices.
     * @param vault_ Address of the deployed SynturaVault.
     */
    function setVault(address vault_) external onlyOwner {
        if (vault_ == address(0)) revert ZeroAddress();
        vault = vault_;
        emit VaultUpdated(vault_);
    }

    // ──────────────────────────────── Supplier flow ──────────────────────────

    /**
     * @notice Tokenizes an invoice receivable as an ERC-721 minted to the caller.
     * @param debtorName   Display name of the paying debtor.
     * @param faceValueUSD Face value in USD-pegged notional units (18 decimals).
     * @param dueDate      Unix timestamp the invoice falls due (must be future).
     * @param metadataURI  Optional token metadata URI (empty string to skip).
     * @return invoiceId   The newly minted token id.
     */
    function mintInvoice(
        string calldata debtorName,
        uint256 faceValueUSD,
        uint256 dueDate,
        string calldata metadataURI
    ) external returns (uint256 invoiceId) {
        if (bytes(debtorName).length == 0) revert EmptyDebtorName();
        if (faceValueUSD == 0) revert ZeroFaceValue();
        if (dueDate <= block.timestamp) revert DueDateInPast(dueDate);

        unchecked {
            invoiceId = ++totalInvoices;
        }

        _invoices[invoiceId] = Invoice({
            invoiceId: invoiceId,
            supplier: msg.sender,
            debtorName: debtorName,
            faceValueUSD: faceValueUSD,
            dueDate: dueDate,
            riskScore: 0,
            discountRateBps: 0,
            isUnderwritten: false,
            isSettled: false
        });

        _safeMint(msg.sender, invoiceId);
        if (bytes(metadataURI).length != 0) {
            _setTokenURI(invoiceId, metadataURI);
        }

        emit InvoiceMinted(invoiceId, msg.sender, faceValueUSD, dueDate);
    }

    // ──────────────────────────────── Sentry flow ────────────────────────────

    /**
     * @notice Records a verified AI sentry's underwriting decision on an invoice.
     * @dev Callable once per invoice by a registry-verified sentry or the owner.
     * @param invoiceId       Token id to underwrite.
     * @param riskScore       AI risk score 0-100 (higher = safer).
     * @param discountRateBps Discount rate in basis points (max `MAX_DISCOUNT_BPS`).
     * @param auditHash       Deterministic commitment over the model payload + scores.
     */
    function underwriteInvoice(
        uint256 invoiceId,
        uint16 riskScore,
        uint16 discountRateBps,
        bytes32 auditHash
    ) external invoiceExists(invoiceId) {
        if (!sentryRegistry.isVerifiedSentry(msg.sender) && msg.sender != owner()) {
            revert NotSentryOrOwner(msg.sender);
        }
        if (riskScore > 100) revert RiskScoreOutOfRange(riskScore);
        if (discountRateBps > MAX_DISCOUNT_BPS) revert DiscountRateTooHigh(discountRateBps);
        if (auditHash == bytes32(0)) revert EmptyAuditHash();

        Invoice storage inv = _invoices[invoiceId];
        if (inv.isUnderwritten) revert AlreadyUnderwritten(invoiceId);
        if (inv.isSettled) revert AlreadySettled(invoiceId);

        inv.riskScore = riskScore;
        inv.discountRateBps = discountRateBps;
        inv.isUnderwritten = true;
        auditHashOf[invoiceId] = auditHash;

        emit InvoiceUnderwritten(invoiceId, riskScore, discountRateBps, auditHash);
    }

    // ───────────────────────────────── Vault flow ────────────────────────────

    /**
     * @notice Marks an invoice as settled and emits the gross 90/7/3 waterfall.
     * @dev Only the wired vault may call: the vault is the sole actor that both
     *      moves the settlement value and reconciles its outstanding-advance
     *      accounting, so settling out-of-band (e.g. by the owner) would strand
     *      streamed advances in the vault forever. The vault nets the supplier
     *      leg against any streamed advance; the amounts emitted here are the
     *      gross split over face value.
     * @param invoiceId Token id to settle.
     */
    function settleInvoice(uint256 invoiceId) external invoiceExists(invoiceId) {
        if (msg.sender != vault) revert NotVault(msg.sender);

        Invoice storage inv = _invoices[invoiceId];
        if (!inv.isUnderwritten) revert NotUnderwritten(invoiceId);
        if (inv.isSettled) revert AlreadySettled(invoiceId);

        inv.isSettled = true;

        uint256 face = inv.faceValueUSD;
        uint256 supplierPayout = (face * SUPPLIER_SPLIT_BPS) / BPS_DENOMINATOR;
        uint256 poolFee = (face * POOL_SPLIT_BPS) / BPS_DENOMINATOR;
        uint256 treasuryFee = face - supplierPayout - poolFee; // absorbs rounding dust

        emit InvoiceSettled(invoiceId, supplierPayout, poolFee, treasuryFee);
    }

    // ──────────────────────────────────── Views ──────────────────────────────

    /**
     * @notice Returns the full on-chain record of an invoice.
     * @param invoiceId Token id to read.
     * @return The invoice struct.
     */
    function getInvoice(uint256 invoiceId)
        external
        view
        invoiceExists(invoiceId)
        returns (Invoice memory)
    {
        return _invoices[invoiceId];
    }

    // ─────────────────────────────── ERC-721 plumbing ────────────────────────

    /**
     * @dev Keeps `Invoice.supplier` in sync with token ownership so streamed
     *      payouts always reach the current holder of the receivable.
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address previousOwner = super._update(to, tokenId, auth);
        if (to != address(0) && _invoices[tokenId].invoiceId != 0) {
            _invoices[tokenId].supplier = to;
        }
        return previousOwner;
    }

    /**
     * @notice Returns the metadata URI for a token.
     * @param tokenId Token id to read.
     * @return The stored metadata URI.
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    /**
     * @notice ERC-165 interface support (ERC-721 + metadata + ERC-4906).
     * @param interfaceId Interface id to check.
     * @return True when the interface is supported.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
