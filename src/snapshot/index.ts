/**
 * Snapshot Integration Module
 * 
 * Exports all Snapshot-related components for governance voting.
 */

// Snapshot Client
export type {
  SnapshotProposalType,
  SnapshotProposalState,
  SnapshotProposal,
  SnapshotVote,
  CreateProposalParams,
  SnapshotClientConfig
} from './SnapshotClient.js';

export { SnapshotClient, DEFAULT_SNAPSHOT_CONFIG } from './SnapshotClient.js';

