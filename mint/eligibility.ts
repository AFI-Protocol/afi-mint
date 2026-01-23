/**
 * Signal Eligibility Checks
 * 
 * Utility functions for checking signal eligibility for minting.
 * These are lightweight helpers; full validation is in orchestrator.
 */

import type { SignalValidatorState, ValidatorConfig } from '../src/orchestrator/types.js';
import { DEFAULT_VALIDATOR_CONFIG } from '../src/orchestrator/types.js';

/**
 * Check if a signal has expired based on age and decay.
 */
export function isSignalExpired(
  ageHours: number,
  halfLifeHours: number,
  maxHalfLives: number = 5
): boolean {
  return ageHours >= halfLifeHours * maxHalfLives;
}

/**
 * Check if a signal passes decay threshold.
 */
export function passesDecayThreshold(
  decayScore: number,
  threshold: number = DEFAULT_VALIDATOR_CONFIG.minDecayScoreThreshold
): boolean {
  return decayScore >= threshold;
}

/**
 * Check if a challenge vote passes thresholds.
 */
export function passesChallengeThresholds(
  approvalPercentage: number,
  quorum: number,
  config: Partial<ValidatorConfig> = {}
): boolean {
  const thresholds = { ...DEFAULT_VALIDATOR_CONFIG, ...config };
  return (
    approvalPercentage >= thresholds.challengeSuccessThreshold &&
    quorum >= thresholds.minDisputeQuorumThreshold
  );
}

/**
 * Check if a signal is ready for minting.
 */
export function isReadyForMint(state: SignalValidatorState): boolean {
  return (
    (state.state === 'finalized' || state.state === 'dispute_resolved') &&
    state.finalDecision === 'mint'
  );
}

/**
 * Check if a signal can be challenged.
 */
export function canBeChalllenged(state: SignalValidatorState): boolean {
  return state.state === 'challenge_window' && !state.wasChallenged;
}

/**
 * Check if a signal can be retried for minting.
 */
export function canRetryMint(state: SignalValidatorState): boolean {
  return (
    state.finalDecision === 'mint' &&
    state.state !== 'minted' &&
    !state.mintTxHash
  );
}
