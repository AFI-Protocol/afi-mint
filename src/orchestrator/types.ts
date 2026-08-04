/**
 * Validator Orchestrator Types
 * 
 * Core types for the signal validation and minting pipeline.
 * 
 * DESIGN PRINCIPLE:
 * - Validator makes AUTOMATIC decision based on AFI scoring standards
 * - Determinations are mechanically verifiable; there is no appeal or dispute
 *   process (the challenge layer was retired by CHR-GOV D-CHR-1)
 */

/**
 * Signal validator state machine states.
 * 
 * State transitions (Happy Path):
 * PENDING → QUALIFIED → FINALIZED → MINTED
 * PENDING → REJECTED → FINALIZED (no mint)
 * 
 * PENDING: Signal scored by analyst, awaiting validator decision
 * QUALIFIED: Validator approved signal for minting (automatic, based on AFI standards)
 * REJECTED: Validator rejected signal (automatic, based on AFI standards)
 * FINALIZED: Qualified and the maturity hold has elapsed, ready for execution
 *            (CHR-GOV D-CHR-2(3))
 * MINTED: Token minted successfully (terminal state)
 * REJECTED_FINAL: Signal definitively rejected (terminal state)
 */
export type SignalValidatorStateKind =
  | 'pending'
  | 'qualified'
  | 'rejected'
  | 'finalized'
  | 'minted'
  | 'rejected_final';

/**
 * Validator decision kind - the automatic decision made by the validator.
 */
export type ValidatorDecisionKind = 'qualified' | 'rejected';

/**
 * Signal validator state record.
 * Tracks a signal through the validation → mint pipeline.
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
  
  // === Finalization ===
  /** Final decision (CHR-GOV D-CHR-2(3): qualified + maturity hold elapsed) */
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
  
  // === Scoring Thresholds (for automatic decision) ===
  /** Minimum decay score to qualify for minting (0-1) */
  minDecayScoreThreshold: number;
  /** Base half-life for decay calculation in hours */
  baseHalfLifeHours: number;
}

/**
 * Default validator configuration.
 */
export const DEFAULT_VALIDATOR_CONFIG: ValidatorConfig = {
  // Timing
  processingIntervalMs: 60000, // 1 minute
  
  // Scoring thresholds
  minDecayScoreThreshold: 0.5, // 50% of original score to qualify
  baseHalfLifeHours: 24
};
