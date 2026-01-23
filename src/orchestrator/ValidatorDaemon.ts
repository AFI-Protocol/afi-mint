/**
 * Validator Daemon
 * 
 * Main orchestrator for the appeal-based signal validation pipeline.
 * 
 * DESIGN:
 * 1. Process pending signals → Make automatic validator decisions
 * 2. Open challenge windows for decided signals
 * 3. Finalize unchallenged signals when windows close
 * 4. Process disputed signals after voting completes
 * 5. Execute minting for approved signals
 */

import type { SignalStateManager } from './SignalStateManager.js';
import type { ChallengeWindowManager } from './ChallengeWindowManager.js';
import type { DisputeResolver } from './DisputeResolver.js';
import type { MintExecutor } from './MintExecutor.js';
import type { ValidatorConfig, ValidatorDecisionKind } from './types.js';
import { DEFAULT_VALIDATOR_CONFIG } from './types.js';

/**
 * Analyst score input for validator decision.
 */
export interface AnalystScoreInput {
  signalId: string;
  uwrScore: number;
  conviction: number;
  scoredAt: string;
}

/**
 * Validator scoring function interface.
 */
export interface IValidatorScorer {
  computeScore(
    analystScore: AnalystScoreInput,
    volatility?: number,
    now?: number
  ): {
    baseScore: number;
    decayedScore: number;
    ageHours: number;
    halfLifeHours: number;
  };
}

/**
 * Analyst score fetcher interface.
 */
export interface IAnalystScoreFetcher {
  getAnalystScore(signalId: string): Promise<AnalystScoreInput | null>;
}

/**
 * Daemon run statistics.
 */
export interface DaemonRunStats {
  runId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  phases: {
    validatorDecisions: {
      processed: number;
      qualified: number;
      rejected: number;
      errors: number;
    };
    challengeWindows: {
      opened: number;
      finalized: number;
      errors: number;
    };
    disputes: {
      resolved: number;
      errors: number;
    };
    minting: {
      minted: number;
      rejected: number;
      errors: number;
    };
  };
  errors: string[];
}

/**
 * Logger interface.
 */
export interface IDaemonLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Console-based daemon logger.
 */
export class ConsoleDaemonLogger implements IDaemonLogger {
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(`[ValidatorDaemon] INFO: ${message}`, meta ?? '');
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(`[ValidatorDaemon] WARN: ${message}`, meta ?? '');
  }
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(`[ValidatorDaemon] ERROR: ${message}`, meta ?? '');
  }
}

/**
 * Validator Daemon
 * 
 * Orchestrates the complete appeal-based validation pipeline:
 * 1. Validator Decision: Auto-qualify/reject based on AFI scoring standards
 * 2. Challenge Window: Open windows for appeals
 * 3. Finalization: Close unchallenged windows, process disputes
 * 4. Execution: Mint approved signals, finalize rejections
 */
export class ValidatorDaemon {
  private readonly config: ValidatorConfig;
  private intervalHandle?: ReturnType<typeof setInterval>;
  private isRunning = false;
  private lastRunStats?: DaemonRunStats;

  constructor(
    private readonly stateManager: SignalStateManager,
    private readonly windowManager: ChallengeWindowManager,
    private readonly disputeResolver: DisputeResolver,
    private readonly mintExecutor: MintExecutor,
    private readonly scorer: IValidatorScorer,
    private readonly scoreFetcher: IAnalystScoreFetcher,
    private readonly logger: IDaemonLogger = new ConsoleDaemonLogger(),
    config?: Partial<ValidatorConfig>
  ) {
    this.config = { ...DEFAULT_VALIDATOR_CONFIG, ...config };
  }

  /**
   * Start the daemon with interval-based scheduling.
   */
  start(): void {
    if (this.intervalHandle) {
      this.logger.warn('Daemon already running');
      return;
    }

    this.logger.info('Starting validator daemon', {
      intervalMs: this.config.processingIntervalMs
    });

    // Run immediately on start
    this.runCycle();

    // Schedule regular runs
    this.intervalHandle = setInterval(
      () => this.runCycle(),
      this.config.processingIntervalMs
    );
  }

  /**
   * Stop the daemon.
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
      this.logger.info('Validator daemon stopped');
    }
  }

  /**
   * Run a single cycle of the validation pipeline.
   */
  async runCycle(): Promise<DaemonRunStats> {
    if (this.isRunning) {
      this.logger.warn('Previous cycle still running, skipping');
      return this.lastRunStats!;
    }

    this.isRunning = true;
    const runId = `run-${Date.now()}`;
    const startedAt = new Date().toISOString();
    const errors: string[] = [];

    this.logger.info('Starting validation cycle', { runId });

    const stats: DaemonRunStats = {
      runId,
      startedAt,
      completedAt: '',
      durationMs: 0,
      phases: {
        validatorDecisions: { processed: 0, qualified: 0, rejected: 0, errors: 0 },
        challengeWindows: { opened: 0, finalized: 0, errors: 0 },
        disputes: { resolved: 0, errors: 0 },
        minting: { minted: 0, rejected: 0, errors: 0 }
      },
      errors: []
    };

    // Phase 1: Process pending signals → Make validator decisions
    try {
      const decisionResult = await this.processValidatorDecisions();
      stats.phases.validatorDecisions = decisionResult;
      this.logger.info('Validator decisions complete', decisionResult);
    } catch (err) {
      const msg = `Validator decisions failed: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      this.logger.error(msg);
    }

    // Phase 2: Open challenge windows for decided signals
    try {
      const openResult = await this.windowManager.openPendingWindows();
      stats.phases.challengeWindows.opened = openResult.opened;
      stats.phases.challengeWindows.errors += openResult.errors.length;
      openResult.errors.forEach(e => errors.push(`Window open error: ${e.error}`));
      this.logger.info('Challenge windows opened', { opened: openResult.opened });
    } catch (err) {
      const msg = `Challenge window opening failed: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      this.logger.error(msg);
    }

    // Phase 3: Finalize unchallenged signals
    try {
      const finalizeResult = await this.windowManager.finalizeExpiredWindows();
      stats.phases.challengeWindows.finalized = finalizeResult.finalized;
      stats.phases.challengeWindows.errors += finalizeResult.errors.length;
      finalizeResult.errors.forEach(e => errors.push(`Finalization error: ${e.error}`));
      this.logger.info('Unchallenged signals finalized', { finalized: finalizeResult.finalized });
    } catch (err) {
      const msg = `Finalization failed: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      this.logger.error(msg);
    }

    // Phase 4: Process dispute resolutions
    try {
      const disputeResult = await this.disputeResolver.processCompletedDisputes();
      stats.phases.disputes = disputeResult;
      this.logger.info('Disputes resolved', disputeResult);
    } catch (err) {
      const msg = `Dispute resolution failed: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      this.logger.error(msg);
    }

    // Phase 5: Execute minting and rejections
    try {
      const mintResult = await this.mintExecutor.processReadySignals();
      stats.phases.minting = mintResult;
      this.logger.info('Minting complete', mintResult);
    } catch (err) {
      const msg = `Minting failed: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      this.logger.error(msg);
    }

    const completedAt = new Date().toISOString();
    stats.completedAt = completedAt;
    stats.durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    stats.errors = errors;

    this.lastRunStats = stats;
    this.isRunning = false;

    this.logger.info('Validation cycle complete', {
      runId,
      durationMs: stats.durationMs,
      errorCount: errors.length
    });

    return stats;
  }

  /**
   * Process pending signals and make automatic validator decisions.
   */
  private async processValidatorDecisions(): Promise<{
    processed: number;
    qualified: number;
    rejected: number;
    errors: number;
  }> {
    const pending = await this.stateManager.getPendingSignals();
    let qualified = 0;
    let rejected = 0;
    let errorCount = 0;

    for (const signal of pending) {
      try {
        const analystScore = await this.scoreFetcher.getAnalystScore(signal.signalId);
        if (!analystScore) {
          this.logger.warn(`No analyst score for signal ${signal.signalId}`);
          errorCount++;
          continue;
        }

        // Compute decay score using AFI scoring standards
        const scoreResult = this.scorer.computeScore(analystScore);

        // Make automatic decision based on threshold
        const decision: ValidatorDecisionKind = 
          scoreResult.decayedScore >= this.config.minDecayScoreThreshold
            ? 'qualified'
            : 'rejected';

        const reason = decision === 'qualified'
          ? `Decay score ${scoreResult.decayedScore.toFixed(4)} >= threshold ${this.config.minDecayScoreThreshold}`
          : `Decay score ${scoreResult.decayedScore.toFixed(4)} < threshold ${this.config.minDecayScoreThreshold}`;

        await this.stateManager.recordValidatorDecision(
          signal.signalId,
          decision,
          {
            decayScore: scoreResult.decayedScore,
            baseScore: scoreResult.baseScore,
            ageHours: scoreResult.ageHours,
            halfLifeHours: scoreResult.halfLifeHours
          },
          reason
        );

        if (decision === 'qualified') {
          qualified++;
        } else {
          rejected++;
        }
      } catch (err) {
        this.logger.error(`Error processing signal ${signal.signalId}: ${err}`);
        errorCount++;
      }
    }

    return {
      processed: pending.length,
      qualified,
      rejected,
      errors: errorCount
    };
  }

  /**
   * Get the last run statistics.
   */
  getLastRunStats(): DaemonRunStats | undefined {
    return this.lastRunStats;
  }

  /**
   * Check if daemon is currently running a cycle.
   */
  isProcessing(): boolean {
    return this.isRunning;
  }

  /**
   * Check if daemon is started.
   */
  isStarted(): boolean {
    return !!this.intervalHandle;
  }

  /**
   * Run a single cycle manually (for testing/CLI).
   */
  async runOnce(): Promise<DaemonRunStats> {
    return this.runCycle();
  }
}
