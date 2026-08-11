// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SynturaSentryRegistry
 * @author Ifeanyichukwu Onwo (mrnetwork)
 * @notice On-chain identity registry for Syntura AI Risk Sentry agents plus a
 *         tamper-evident store of their underwriting commitments.
 * @dev A "sentry" is an autonomous AI agent (identified by an EOA it controls)
 *      that underwrites tokenized RWA invoices. The protocol owner curates the
 *      sentry set; verified sentries publish risk-score commitments — the
 *      `auditHash` is a deterministic commitment over the full model input
 *      payload + scores (the reference agent uses an FNV-1a/xorshift
 *      construction), so anyone can later reproduce and verify the model
 *      run off-chain against what was committed on-chain.
 */
contract SynturaSentryRegistry is Ownable {
    // ─────────────────────────────────── Types ───────────────────────────────

    /// @notice Registered AI sentry agent metadata.
    struct Sentry {
        /// @dev Model identifier published by the agent, e.g. "syntura-sentry-v1".
        string modelId;
        /// @dev Timestamp of (re-)registration.
        uint64 registeredAt;
        /// @dev Whether the sentry is currently verified/active.
        bool active;
    }

    /// @notice Latest risk commitment recorded for an invoice.
    struct Commitment {
        /// @dev Sentry agent that produced the commitment.
        address agent;
        /// @dev Risk score 0-100 (higher = safer).
        uint16 riskScore;
        /// @dev Deterministic commitment hash over payload + scores.
        bytes32 auditHash;
        /// @dev Block timestamp of the commitment.
        uint64 committedAt;
    }

    // ─────────────────────────────────── Errors ──────────────────────────────

    /// @notice Caller is not a verified sentry agent.
    error NotVerifiedSentry(address caller);
    /// @notice Zero address supplied where a real agent address is required.
    error ZeroAgent();
    /// @notice Empty model identifier supplied.
    error EmptyModelId();
    /// @notice Risk score exceeds the 0-100 scale.
    error RiskScoreOutOfRange(uint16 riskScore);
    /// @notice Zero audit hash supplied — commitments must carry a real hash.
    error EmptyAuditHash();
    /// @notice Agent is not registered, so it cannot be revoked.
    error SentryNotRegistered(address agent);

    // ─────────────────────────────────── Events ──────────────────────────────

    /// @notice Emitted when the owner registers (or re-registers) a sentry agent.
    /// @param agent   Address controlled by the AI sentry.
    /// @param modelId Model identifier the sentry runs, e.g. "syntura-sentry-v1".
    event SentryRegistered(address indexed agent, string modelId);

    /// @notice Emitted when the owner revokes a sentry's verified status.
    /// @param agent Address of the revoked sentry.
    event SentryRevoked(address indexed agent);

    /// @notice Emitted when a verified sentry commits a risk score for an invoice.
    /// @param invoiceId Invoice token id the commitment refers to.
    /// @param agent     Sentry that produced the score.
    /// @param riskScore Risk score 0-100 (higher = safer).
    /// @param auditHash Deterministic commitment over payload + scores.
    event RiskScoreCommitted(
        uint256 indexed invoiceId,
        address indexed agent,
        uint16 riskScore,
        bytes32 auditHash
    );

    // ─────────────────────────────────── Storage ─────────────────────────────

    /// @notice Registered sentry metadata by agent address.
    mapping(address => Sentry) public sentries;

    /// @notice Latest risk commitment per invoice id.
    mapping(uint256 => Commitment) private _commitments;

    /// @notice Number of commitments each sentry has published.
    mapping(address => uint256) public commitmentsOf;

    /// @notice Total commitments recorded across all sentries.
    uint256 public totalCommitments;

    /// @notice Total sentries ever registered (revocation does not decrement).
    uint256 public totalSentries;

    // ────────────────────────────────── Modifiers ────────────────────────────

    /// @dev Restricts a function to currently-verified sentry agents.
    modifier onlyVerifiedSentry() {
        if (!sentries[msg.sender].active) revert NotVerifiedSentry(msg.sender);
        _;
    }

    // ───────────────────────────────── Constructor ───────────────────────────

    /**
     * @notice Deploys the registry with the deployer as protocol owner.
     */
    constructor() Ownable(msg.sender) {}

    // ─────────────────────────────── Owner actions ───────────────────────────

    /**
     * @notice Registers (or re-registers) an AI sentry agent as verified.
     * @dev Re-registering an active agent updates its `modelId` — useful for
     *      model version bumps without rotating the agent key.
     * @param agent   Address controlled by the AI sentry agent.
     * @param modelId Model identifier string, e.g. "syntura-sentry-v1".
     */
    function registerSentry(address agent, string calldata modelId) external onlyOwner {
        if (agent == address(0)) revert ZeroAgent();
        if (bytes(modelId).length == 0) revert EmptyModelId();

        if (sentries[agent].registeredAt == 0) {
            unchecked {
                ++totalSentries;
            }
        }
        sentries[agent] = Sentry({
            modelId: modelId,
            registeredAt: uint64(block.timestamp),
            active: true
        });

        emit SentryRegistered(agent, modelId);
    }

    /**
     * @notice Revokes a sentry's verified status. Its historical commitments remain.
     * @param agent Address of the sentry to revoke.
     */
    function revokeSentry(address agent) external onlyOwner {
        if (sentries[agent].registeredAt == 0) revert SentryNotRegistered(agent);
        sentries[agent].active = false;
        emit SentryRevoked(agent);
    }

    // ─────────────────────────────── Sentry actions ──────────────────────────

    /**
     * @notice Commits a risk score + audit hash for an invoice on-chain.
     * @dev Only verified sentries may commit. A later commitment for the same
     *      invoice overwrites the stored "latest" record but every commitment
     *      is permanently observable through `RiskScoreCommitted` events.
     * @param invoiceId Invoice token id the score refers to.
     * @param riskScore Risk score 0-100 (higher = safer).
     * @param auditHash Deterministic commitment over the model payload + scores.
     */
    function commitRiskScore(
        uint256 invoiceId,
        uint16 riskScore,
        bytes32 auditHash
    ) external onlyVerifiedSentry {
        if (riskScore > 100) revert RiskScoreOutOfRange(riskScore);
        if (auditHash == bytes32(0)) revert EmptyAuditHash();

        _commitments[invoiceId] = Commitment({
            agent: msg.sender,
            riskScore: riskScore,
            auditHash: auditHash,
            committedAt: uint64(block.timestamp)
        });
        unchecked {
            ++commitmentsOf[msg.sender];
            ++totalCommitments;
        }

        emit RiskScoreCommitted(invoiceId, msg.sender, riskScore, auditHash);
    }

    // ──────────────────────────────────── Views ──────────────────────────────

    /**
     * @notice Whether `agent` is a currently-verified sentry.
     * @param agent Address to check.
     * @return True when the agent is registered and active.
     */
    function isVerifiedSentry(address agent) external view returns (bool) {
        return sentries[agent].active;
    }

    /**
     * @notice Returns the latest risk commitment recorded for an invoice.
     * @param invoiceId Invoice token id.
     * @return The stored commitment (zeroed struct when none exists).
     */
    function getCommitment(uint256 invoiceId) external view returns (Commitment memory) {
        return _commitments[invoiceId];
    }

    /**
     * @notice Returns the model identifier a sentry registered with.
     * @param agent Sentry address.
     * @return The sentry's model id string (empty when unregistered).
     */
    function sentryModelId(address agent) external view returns (string memory) {
        return sentries[agent].modelId;
    }
}
