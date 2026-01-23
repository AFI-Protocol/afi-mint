/**
 * Dispute Resolver
 * 
 * Handles resolution of challenged signals via Snapshot voting.
 * 
 * DESIGN:
 * - Monitors contested signals for completed Snapshot votes
 * - Evaluates vote results against challenge success threshold
 * - Records dispute outcomes and determines final decision
 */

import type { SignalStateManager } from './SignalStateManager.js';
import type { ValidatorConfig, VoteResult, SignalValidatorState } from './types.js';
import { DEFAULT_VALIDATOR_CONFIG } from './types.js';

/**
 * Snapshot vote reader interface.
 */
export interface ISnapshotVoteReader {
  getVoteResult(proposalId: string): Promise<VoteResult | null>;
  isVotingComplete(proposalId: string): Promise<boolean>;
}

/**
 * Dispute Resolver
 * 
 * Processes completed dispute votes and determines outcomes.
 */
export class DisputeResolver {
  private readonly config: ValidatorConfig;

  constructor(
    private readonly stateManager: SignalStateManager,
    private readonly voteReader: ISnapshotVoteReader,
    config?: Partial<ValidatorConfig>
  ) {
    this.config = { ...DEFAULT_VALIDATOR_CONFIG, ...config };
  }

  /**
   * Process all contested signals with completed votes.
   */
  async processCompletedDisputes(): Promise<{
    resolved: number;
    errors: number;
  }> {
    const contested = await this.stateManager.getContestedSignals();
    let resolved = 0;
    let errors = 0;

    for (const signal of contested) {
      try {
        const wasResolved = await this.resolveDispute(signal);
        if (wasResolved) {
          resolved++;
        }
      } catch (err) {
        errors++;
      }
    }

    return { resolved, errors };
  }

  /**
   * Attempt to resolve a single dispute.
   * Returns true if resolved, false if voting not yet complete.
   */
  async resolveDispute(signal: SignalValidatorState): Promise<boolean> {
    if (!signal.challenge?.snapshotProposalId) {
      return false;
    }

    // Check if voting is complete
    const isComplete = await this.voteReader.isVotingComplete(signal.challenge.snapshotProposalId);
    if (!isComplete) {
      return false;
    }

    // Get vote result
    const voteResult = await this.voteReader.getVoteResult(signal.challenge.snapshotProposalId);
    if (!voteResult) {
      return false;
    }

    // Evaluate challenge outcome
    const challengeSucceeded = this.evaluateChallengeOutcome(voteResult);

    // Record dispute outcome
    await this.stateManager.recordDisputeOutcome(
      signal.signalId,
      voteResult,
      challengeSucceeded
    );

    return true;
  }

  /**
   * Evaluate whether a challenge succeeded based on vote results.
   * 
   * Challenge succeeds if:
   * 1. Quorum is met
   * 2. "For" votes (overturn) exceed threshold
   */
  evaluateChallengeOutcome(voteResult: VoteResult): boolean {
    const totalVotes = voteResult.for + voteResult.against + (voteResult.abstain ?? 0);
    
    // Check quorum
    const quorumMet = (voteResult.quorum ?? totalVotes) >= this.config.minDisputeQuorumThreshold;
    if (!quorumMet) {
      return false; // Challenge fails if quorum not met
    }

    // Check approval threshold
    const effectiveVotes = voteResult.for + voteResult.against;
    if (effectiveVotes === 0) {
      return false;
    }

    const approvalRate = voteResult.for / effectiveVotes;
    return approvalRate >= this.config.challengeSuccessThreshold;
  }

  /**
   * Get dispute status for a signal.
   */
  async getDisputeStatus(signalId: string): Promise<{
    isDisputed: boolean;
    isResolved: boolean;
    votingComplete: boolean;
    challengeSucceeded?: boolean;
    voteResult?: VoteResult;
  } | null> {
    const state = await this.stateManager.getState(signalId);
    if (!state) return null;

    const isDisputed = state.wasChallenged;
    const isResolved = state.state === 'dispute_resolved';

    let votingComplete = false;
    if (state.challenge?.snapshotProposalId) {
      votingComplete = await this.voteReader.isVotingComplete(state.challenge.snapshotProposalId);
    }

    return {
      isDisputed,
      isResolved,
      votingComplete,
      challengeSucceeded: state.disputeOutcome?.challengeSucceeded,
      voteResult: state.disputeOutcome?.voteResult
    };
  }

  /**
   * Get all signals pending dispute resolution.
   */
  async getPendingDisputes(): Promise<SignalValidatorState[]> {
    return this.stateManager.getContestedSignals();
  }

  /**
   * Simulate challenge outcome for a hypothetical vote result.
   */
  simulateChallengeOutcome(forVotes: number, againstVotes: number, _abstainVotes: number = 0): {
    wouldSucceed: boolean;
    approvalRate: number;
    threshold: number;
  } {
    const effectiveVotes = forVotes + againstVotes;
    const approvalRate = effectiveVotes > 0 ? forVotes / effectiveVotes : 0;
    
    return {
      wouldSucceed: approvalRate >= this.config.challengeSuccessThreshold,
      approvalRate,
      threshold: this.config.challengeSuccessThreshold
    };
  }
}
