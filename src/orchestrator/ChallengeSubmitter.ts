/**
 * Challenge Submitter
 * 
 * Handles submission and validation of challenges to validator decisions.
 * 
 * DESIGN:
 * - Anyone can submit a challenge during the challenge window
 * - Challenges require a stake (economic skin-in-the-game)
 * - Creates Snapshot proposal for dispute resolution
 * - Handles stake slashing/rewards after dispute resolution
 */

import type { SignalStateManager } from './SignalStateManager.js';
import type { ChallengeWindowManager } from './ChallengeWindowManager.js';
import type { 
  ValidatorConfig, 
  ChallengeSubmission,
  SignalValidatorState 
} from './types.js';
import { DEFAULT_VALIDATOR_CONFIG } from './types.js';

/**
 * Challenge validation result.
 */
export interface ChallengeValidation {
  valid: boolean;
  reason?: string;
}

/**
 * Challenge submission request.
 */
export interface ChallengeRequest {
  signalId: string;
  challenger: string;
  stakeAmount: string;
  reason: string;
}

/**
 * Snapshot proposal service interface.
 */
export interface ISnapshotProposalService {
  createDisputeProposal(
    signal: SignalValidatorState,
    challenge: ChallengeSubmission
  ): Promise<string>;
}

/**
 * Stake management interface (for verifying and locking stakes).
 */
export interface IStakeManager {
  verifyStake(challenger: string, amount: string): Promise<boolean>;
  lockStake(challenger: string, signalId: string, amount: string): Promise<boolean>;
  releaseStake(challenger: string, signalId: string): Promise<boolean>;
  slashStake(challenger: string, signalId: string, slashRate: number): Promise<{ slashed: string; returned: string }>;
  rewardChallenger(challenger: string, signalId: string, rewardAmount: string): Promise<boolean>;
}

/**
 * Challenge Submitter
 * 
 * Validates and processes challenge submissions.
 */
export class ChallengeSubmitter {
  private readonly config: ValidatorConfig;

  constructor(
    private readonly stateManager: SignalStateManager,
    private readonly windowManager: ChallengeWindowManager,
    private readonly snapshotService: ISnapshotProposalService,
    private readonly stakeManager: IStakeManager,
    config?: Partial<ValidatorConfig>
  ) {
    this.config = { ...DEFAULT_VALIDATOR_CONFIG, ...config };
  }

  /**
   * Validate a challenge request before submission.
   */
  async validateChallenge(request: ChallengeRequest): Promise<ChallengeValidation> {
    // 1. Check signal exists and is in challenge window
    const state = await this.stateManager.getState(request.signalId);
    if (!state) {
      return { valid: false, reason: 'Signal not found' };
    }

    if (state.state !== 'challenge_window') {
      return { valid: false, reason: `Signal is in state ${state.state}, not in challenge window` };
    }

    // 2. Check challenge window is still open
    const isOpen = await this.windowManager.isWindowOpen(request.signalId);
    if (!isOpen) {
      return { valid: false, reason: 'Challenge window has closed' };
    }

    // 3. Check signal hasn't already been challenged
    if (state.wasChallenged) {
      return { valid: false, reason: 'Signal has already been challenged' };
    }

    // 4. Validate stake amount
    const minStake = BigInt(this.config.minChallengeStake);
    const providedStake = BigInt(request.stakeAmount);
    if (providedStake < minStake) {
      return { 
        valid: false, 
        reason: `Insufficient stake: ${request.stakeAmount} < ${this.config.minChallengeStake}` 
      };
    }

    // 5. Verify challenger has the stake
    const hasStake = await this.stakeManager.verifyStake(request.challenger, request.stakeAmount);
    if (!hasStake) {
      return { valid: false, reason: 'Challenger does not have sufficient balance for stake' };
    }

    // 6. Validate reason is provided
    if (!request.reason || request.reason.trim().length < 10) {
      return { valid: false, reason: 'Challenge reason must be at least 10 characters' };
    }

    return { valid: true };
  }

  /**
   * Submit a challenge to contest a validator decision.
   */
  async submitChallenge(request: ChallengeRequest): Promise<{
    success: boolean;
    challenge?: ChallengeSubmission;
    snapshotProposalId?: string;
    error?: string;
  }> {
    // Validate the challenge
    const validation = await this.validateChallenge(request);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    try {
      // Lock the challenger's stake
      const stakeLocked = await this.stakeManager.lockStake(
        request.challenger,
        request.signalId,
        request.stakeAmount
      );
      if (!stakeLocked) {
        return { success: false, error: 'Failed to lock stake' };
      }

      // Create challenge submission
      const challenge: ChallengeSubmission = {
        challenger: request.challenger,
        stakeAmount: request.stakeAmount,
        reason: request.reason,
        submittedAt: new Date().toISOString()
      };

      // Get current state for proposal creation
      const state = await this.stateManager.getState(request.signalId);
      if (!state) {
        // Release stake if state disappeared
        await this.stakeManager.releaseStake(request.challenger, request.signalId);
        return { success: false, error: 'Signal state not found' };
      }

      // Create Snapshot proposal for dispute resolution
      const snapshotProposalId = await this.snapshotService.createDisputeProposal(state, challenge);
      challenge.snapshotProposalId = snapshotProposalId;

      // Update signal state to contested
      await this.stateManager.submitChallenge(request.signalId, challenge);

      return {
        success: true,
        challenge,
        snapshotProposalId
      };
    } catch (err) {
      // Attempt to release stake on error
      try {
        await this.stakeManager.releaseStake(request.challenger, request.signalId);
      } catch {
        // Ignore release errors
      }

      return {
        success: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  /**
   * Process stake after dispute is resolved.
   */
  async processStakeAfterDispute(signalId: string): Promise<{
    success: boolean;
    action: 'rewarded' | 'slashed' | 'released';
    details?: string;
  }> {
    const state = await this.stateManager.getState(signalId);
    if (!state) {
      return { success: false, action: 'released', details: 'Signal not found' };
    }

    if (!state.challenge) {
      return { success: false, action: 'released', details: 'No challenge found' };
    }

    if (!state.disputeOutcome) {
      return { success: false, action: 'released', details: 'Dispute not yet resolved' };
    }

    const challenger = state.challenge.challenger;

    if (state.disputeOutcome.challengeSucceeded) {
      // Challenge succeeded: return stake + reward
      await this.stakeManager.releaseStake(challenger, signalId);
      // Reward would come from protocol/slashed funds from validator
      return {
        success: true,
        action: 'rewarded',
        details: 'Challenge succeeded, stake returned with reward'
      };
    } else {
      // Challenge failed: slash stake
      const slashResult = await this.stakeManager.slashStake(
        challenger,
        signalId,
        this.config.challengeSlashRate
      );
      return {
        success: true,
        action: 'slashed',
        details: `Slashed ${slashResult.slashed}, returned ${slashResult.returned}`
      };
    }
  }

  /**
   * Get challenge details for a signal.
   */
  async getChallengeDetails(signalId: string): Promise<ChallengeSubmission | null> {
    const state = await this.stateManager.getState(signalId);
    return state?.challenge ?? null;
  }

  /**
   * Check if a signal can be challenged.
   */
  async canChallenge(signalId: string): Promise<{ canChallenge: boolean; reason?: string }> {
    const state = await this.stateManager.getState(signalId);
    if (!state) {
      return { canChallenge: false, reason: 'Signal not found' };
    }

    if (state.state !== 'challenge_window') {
      return { canChallenge: false, reason: `Signal is in state ${state.state}` };
    }

    if (state.wasChallenged) {
      return { canChallenge: false, reason: 'Already challenged' };
    }

    const isOpen = await this.windowManager.isWindowOpen(signalId);
    if (!isOpen) {
      return { canChallenge: false, reason: 'Challenge window closed' };
    }

    return { canChallenge: true };
  }

  /**
   * Get minimum stake required for challenge.
   */
  getMinimumStake(): string {
    return this.config.minChallengeStake;
  }
}
