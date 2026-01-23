/**
 * Validator Orchestrator Module
 * 
 * Appeal-based signal validation pipeline.
 * 
 * DESIGN:
 * - Validator makes AUTOMATIC decision based on AFI scoring standards
 * - Challenge window is an APPEAL mechanism for contesting decisions
 * - Only contested signals go through dispute resolution
 * - Most signals auto-finalize without voting overhead
 */

// Types
export type {
  SignalValidatorStateKind,
  ValidatorDecisionKind,
  SignalValidatorState,
  VoteResult,
  ChallengeSubmission,
  DisputeOutcome,
  ValidatorConfig
} from './types.js';

export { DEFAULT_VALIDATOR_CONFIG } from './types.js';

// Signal State Manager
export type { 
  ISignalStateStore, 
  ITransitionLogger,
  StateTransitionEvent 
} from './SignalStateManager.js';

export {
  SignalStateManager,
  InMemorySignalStateStore,
  ConsoleTransitionLogger
} from './SignalStateManager.js';

// Challenge Window Manager
export type { ChallengeWindowStatus } from './ChallengeWindowManager.js';
export { ChallengeWindowManager } from './ChallengeWindowManager.js';

// Challenge Submitter
export type {
  ChallengeValidation,
  ChallengeRequest,
  ISnapshotProposalService,
  IStakeManager
} from './ChallengeSubmitter.js';
export { ChallengeSubmitter } from './ChallengeSubmitter.js';

// Dispute Resolver
export type { ISnapshotVoteReader } from './DisputeResolver.js';
export { DisputeResolver } from './DisputeResolver.js';

// Mint Executor
export type {
  MintRequest,
  IMintCoordinatorContract,
  IMintDataProvider
} from './MintExecutor.js';
export { MintExecutor } from './MintExecutor.js';

// Validator Daemon
export type {
  AnalystScoreInput,
  IValidatorScorer,
  IAnalystScoreFetcher,
  DaemonRunStats,
  IDaemonLogger
} from './ValidatorDaemon.js';
export { ValidatorDaemon, ConsoleDaemonLogger } from './ValidatorDaemon.js';
