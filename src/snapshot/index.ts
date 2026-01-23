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

// Proposal Builder
export type {
  SignalProposalMetadata,
  ProposalBuilderConfig
} from './ProposalBuilder.js';

export { ProposalBuilder } from './ProposalBuilder.js';

// Vote Result Reader
export type { VoteTrackingResult } from './VoteResultReader.js';

export { VoteResultReader } from './VoteResultReader.js';
