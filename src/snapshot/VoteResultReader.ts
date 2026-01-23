/**
 * Vote Result Reader
 * 
 * Reads and parses vote results from Snapshot proposals.
 * Provides utilities for tracking proposal status and extracting vote tallies.
 */

import type { SnapshotClient, SnapshotProposal, SnapshotProposalState } from './SnapshotClient.js';
import type { VoteResult } from '../orchestrator/types.js';

/**
 * Vote tracking result.
 */
export interface VoteTrackingResult {
  proposalId: string;
  state: SnapshotProposalState;
  isComplete: boolean;
  voteResult?: VoteResult;
  remainingSeconds?: number;
  error?: string;
}

/**
 * Vote Result Reader
 * 
 * Provides methods for:
 * - Polling proposal status
 * - Reading final vote tallies
 * - Converting Snapshot results to VoteResult format
 */
export class VoteResultReader {
  constructor(private readonly client: SnapshotClient) {}

  /**
   * Read the vote result for a proposal.
   * Returns null if proposal not found or voting not complete.
   */
  async readVoteResult(proposalId: string): Promise<VoteResult | null> {
    const proposal = await this.client.getProposal(proposalId);
    if (!proposal) return null;

    // Only return final results for closed proposals
    if (proposal.state !== 'closed') {
      return null;
    }

    return this.convertToVoteResult(proposal);
  }

  /**
   * Get current vote result (including active proposals).
   * Use with caution - results may change for active proposals.
   */
  async getCurrentVoteResult(proposalId: string): Promise<VoteResult | null> {
    const proposal = await this.client.getProposal(proposalId);
    if (!proposal) return null;

    return this.convertToVoteResult(proposal);
  }

  /**
   * Convert Snapshot proposal to VoteResult format.
   */
  convertToVoteResult(proposal: SnapshotProposal): VoteResult {
    // Standard AFI format: ["For", "Against", "Abstain"]
    const scores = proposal.scores ?? [0, 0, 0];

    return {
      for: scores[0] ?? 0,
      against: scores[1] ?? 0,
      abstain: scores[2] ?? 0,
      quorum: proposal.votes ?? 0
    };
  }

  /**
   * Track a proposal's voting status.
   */
  async trackProposal(proposalId: string): Promise<VoteTrackingResult> {
    try {
      const proposal = await this.client.getProposal(proposalId);
      
      if (!proposal) {
        return {
          proposalId,
          state: 'pending',
          isComplete: false,
          error: 'Proposal not found'
        };
      }

      const isComplete = proposal.state === 'closed';
      const result: VoteTrackingResult = {
        proposalId,
        state: proposal.state,
        isComplete
      };

      if (isComplete) {
        result.voteResult = this.convertToVoteResult(proposal);
      } else if (proposal.state === 'active') {
        const now = Math.floor(Date.now() / 1000);
        result.remainingSeconds = Math.max(0, proposal.end - now);
      }

      return result;
    } catch (err) {
      return {
        proposalId,
        state: 'pending',
        isComplete: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  /**
   * Wait for a proposal to complete voting.
   * Polls at specified interval until closed or timeout.
   */
  async waitForVotingComplete(
    proposalId: string,
    pollIntervalMs = 60000,
    timeoutMs = 86400000 // 24 hours
  ): Promise<VoteResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const tracking = await this.trackProposal(proposalId);

      if (tracking.error) {
        throw new Error(`Tracking error: ${tracking.error}`);
      }

      if (tracking.isComplete && tracking.voteResult) {
        return tracking.voteResult;
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error(`Timeout waiting for proposal ${proposalId} to complete`);
  }

  /**
   * Check if a proposal has reached quorum.
   */
  async hasQuorum(proposalId: string, minQuorum: number): Promise<boolean> {
    const result = await this.getCurrentVoteResult(proposalId);
    if (!result) return false;

    return (result.quorum ?? 0) >= minQuorum;
  }

  /**
   * Get the current approval percentage.
   */
  async getApprovalPercentage(proposalId: string): Promise<number | null> {
    const result = await this.getCurrentVoteResult(proposalId);
    if (!result) return null;

    const totalVotes = result.for + result.against;
    if (totalVotes === 0) return 0;

    return result.for / totalVotes;
  }

  /**
   * Check multiple proposals and return their statuses.
   */
  async trackMultipleProposals(proposalIds: string[]): Promise<VoteTrackingResult[]> {
    return Promise.all(proposalIds.map(id => this.trackProposal(id)));
  }

  /**
   * Get proposals that have completed voting and need processing.
   */
  async getCompletedProposals(proposalIds: string[]): Promise<{
    proposalId: string;
    voteResult: VoteResult;
  }[]> {
    const results = await this.trackMultipleProposals(proposalIds);
    
    return results
      .filter(r => r.isComplete && r.voteResult)
      .map(r => ({
        proposalId: r.proposalId,
        voteResult: r.voteResult!
      }));
  }
}
