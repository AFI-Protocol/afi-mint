/**
 * Validator Orchestrator Module
 * 
 *  signal validation pipeline.
 * 
 * DESIGN:
 * - Validator makes AUTOMATIC decision based on AFI scoring standards
 * - Determinations are mechanically verifiable; there is no appeal or
 *   dispute process (challenge layer retired, CHR-GOV D-CHR-1)
 * - Most signals auto-finalize without voting overhead
 */

// Types
export type {
  SignalValidatorStateKind,
  ValidatorDecisionKind,
  SignalValidatorState,
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
