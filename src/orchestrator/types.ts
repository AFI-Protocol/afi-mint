/**
 * Validator Orchestrator Types
 * 
 * Core types for the signal validation and minting pipeline.
 * These types track signal state through the appeal-based challenge process.
 * 
 * DESIGN PRINCIPLE:
 * - Validator makes AUTOMATIC decision based on AFI scoring standards
 * - Challenge window is an APPEAL mechanism, not the primary decision
 * - Only contested signals go through dispute resolution
 */

/**
 * Signal validator state machine states.
 * 
 * State transitions (Happy Path - No Challenge):
 * PENDING → QUALIFIED → CHALLENGE_WINDOW → FINALIZED → MINTED
 * PENDING → REJECTED → CHALLENGE_WINDOW → FINALIZED (no mint)
 * 
 * State transitions (Contested):
 * QUALIFIED/REJECTED → CHALLENGE_WINDOW → CONTESTED → DISPUTE_RESOLVED → MINTED | REJECTED_FINAL
 * 
 * PENDING: Signal scored by analyst, awaiting validator decision
 * QUALIFIED: Validator approved signal for minting (automatic, based on AFI standards)
 * REJECTED: Validator rejected signal (automatic, based on AFI standards)
 * CHALLENGE_WINDOW: Decision published, anyone can contest during this period
 * CONTESTED: Someone challenged the decision, dispute resolution in progress
 * DISPUTE_RESOLVED: Dispute vote completed, awaiting finalization
 * FINALIZED: Challenge window closed without contest, ready for execution
 * MINTED: Token minted successfully (terminal state)
 * REJECTED_FINAL: Signal definitively rejected after challenge window or dispute (terminal state)
 */
export type SignalValidatorStateKind =
  | 'pending'
  | 'qualified'
  | 'rejected'
  | 'challenge_window'
  | 'contested'
  | 'dispute_resolved'
  | 'finalized'
  | 'minted'
  | 'rejected_final';

/**
 * Validator decision kind - the automatic decision made by the validator.
 */
export type ValidatorDecisionKind = 'qualified' | 'rejected';

/**
 * Vote result from Snapshot governance (only used for disputed signals).
 */
export interface VoteResult {
  /** Votes in favor of the challenge (overturn original decision) */
  for: number;
  /** Votes against the challenge (uphold original decision) */
  against: number;
  /** Abstention votes */
  abstain?: number;
  /** Total voting power that participated */
  quorum?: number;
}

/**
 * Challenge submission - someone contesting a validator decision.
 */
export interface ChallengeSubmission {
  /** Address of the challenger */
  challenger: string;
  /** Stake amount put up by challenger (in wei or token units) */
  stakeAmount: string;
  /** Reason for the challenge */
  reason: string;
  /** ISO timestamp when challenge was submitted */
  submittedAt: string;
  /** Snapshot proposal ID created for this dispute */
  snapshotProposalId?: string;
}

/**
 * Dispute outcome after voting.
 */
export interface DisputeOutcome {
  /** Whether the challenge succeeded (original decision overturned) */
  challengeSucceeded: boolean;
  /** Final vote result */
  voteResult: VoteResult;
  /** ISO timestamp when dispute was resolved */
  resolvedAt: string;
  /** Whether challenger gets stake back (plus reward if successful) */
  challengerRewarded: boolean;
}

/**
 * Signal validator state record.
 * Tracks a signal through the validation → challenge → mint pipeline.
 */
export interface SignalValidatorState {
  /** Unique signal identifier (links to TSSD vault) */
  signalId: string;
  /** Current state in the validation pipeline */
  state: SignalValidatorStateKind;
  
  // === Scoring Data ===
  /** Time-decayed UWR score at validator decision time */
  decayScore?: number;
  /** Original base score (pre-decay) */
  baseScore?: number;
  /** Signal age in hours at validator decision time */
  ageHours?: number;
  /** Half-life used for decay calculation */
  halfLifeHours?: number;
  
  // === Validator Decision ===
  /** The automatic decision made by validator (qualified/rejected) */
  validatorDecision?: ValidatorDecisionKind;
  /** ISO timestamp when validator made the decision */
  decisionAt?: string;
  /** Reason for validator decision (threshold info, scoring details) */
  decisionReason?: string;
  
  // === Challenge Window ===
  /** ISO timestamp when challenge window opened */
  challengeWindowOpenedAt?: string;
  /** ISO timestamp when challenge window closes */
  challengeWindowClosesAt?: string;
  
  // === Challenge (if contested) ===
  /** Challenge submission details (if someone contested) */
  challenge?: ChallengeSubmission;
  /** Whether signal was challenged during window */
  wasChallenged: boolean;
  
  // === Dispute Resolution (if challenged) ===
  /** Dispute outcome after voting (if challenged) */
  disputeOutcome?: DisputeOutcome;
  
  // === Finalization ===
  /** Final decision after challenge window or dispute */
  finalDecision?: 'mint' | 'reject';
  /** Transaction hash of mint (if minted) */
  mintTxHash?: string;
  /** Final rejection reason (if rejected) */
  rejectionReason?: string;
  
  // === Timestamps ===
  /** ISO timestamp of last state update */
  updatedAt: string;
  /** ISO timestamp when record was created */
  createdAt: string;
}

/**
 * State transition event for audit logging.
 */
export interface StateTransitionEvent {
  signalId: string;
  fromState: SignalValidatorStateKind;
  toState: SignalValidatorStateKind;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Validator configuration (sourced from afi-config).
 */
export interface ValidatorConfig {
  // === Timing ===
  /** Interval between daemon processing cycles in milliseconds */
  processingIntervalMs: number;
  /** Challenge window duration in hours */
  challengeWindowDurationHours: number;
  
  // === Scoring Thresholds (for automatic decision) ===
  /** Minimum decay score to qualify for minting (0-1) */
  minDecayScoreThreshold: number;
  /** Base half-life for decay calculation in hours */
  baseHalfLifeHours: number;
  
  // === Dispute Resolution (only for challenged signals) ===
  /** Minimum approval threshold for challenge to succeed (0-1) */
  challengeSuccessThreshold: number;
  /** Minimum quorum required for valid dispute vote (0-1) */
  minDisputeQuorumThreshold: number;
  /** Snapshot space ID for dispute voting */
  snapshotSpaceId: string;
  
  // === Challenge Economics ===
  /** Minimum stake required to submit a challenge (in token units) */
  minChallengeStake: string;
  /** Percentage of stake slashed if challenge fails (0-1) */
  challengeSlashRate: number;
  /** Percentage of slashed stake rewarded to original decision holder (0-1) */
  slashRewardRate: number;
}

/**
 * Default validator configuration.
 */
export const DEFAULT_VALIDATOR_CONFIG: ValidatorConfig = {
  // Timing
  processingIntervalMs: 60000, // 1 minute
  challengeWindowDurationHours: 24,
  
  // Scoring thresholds
  minDecayScoreThreshold: 0.5, // 50% of original score to qualify
  baseHalfLifeHours: 24,
  
  // Dispute resolution
  challengeSuccessThreshold: 0.66, // 66% to overturn decision
  minDisputeQuorumThreshold: 0.1, // 10% participation
  snapshotSpaceId: 'afi.eth',
  
  // Challenge economics
  minChallengeStake: '100000000000000000000', // 100 tokens (18 decimals)
  challengeSlashRate: 0.5, // 50% slash if challenge fails
  slashRewardRate: 0.8 // 80% of slash goes to defender
};
