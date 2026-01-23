/**
 * Challenge Window Manager
 * 
 * Manages challenge windows for the appeal-based validation pipeline.
 * 
 * DESIGN:
 * - Opens challenge window after validator decision
 * - Monitors for challenges (contests) during window
 * - Finalizes unchallenged signals when window closes
 * - Routes challenged signals to dispute resolution
 */

import type { SignalStateManager } from './SignalStateManager.js';
import type { ValidatorConfig, SignalValidatorState } from './types.js';
import { DEFAULT_VALIDATOR_CONFIG } from './types.js';

/**
 * Challenge window status for a signal.
 */
export interface ChallengeWindowStatus {
  signalId: string;
  isOpen: boolean;
  isChallenged: boolean;
  openedAt?: string;
  closesAt?: string;
  remainingSeconds?: number;
  validatorDecision?: 'qualified' | 'rejected';
}

/**
 * Challenge Window Manager
 * 
 * Responsibilities:
 * 1. Open challenge windows for signals after validator decision
 * 2. Check for expired (unchallenged) windows and finalize them
 * 3. Provide status on active challenge windows
 */
export class ChallengeWindowManager {
  private readonly config: ValidatorConfig;

  constructor(
    private readonly stateManager: SignalStateManager,
    config?: Partial<ValidatorConfig>
  ) {
    this.config = { ...DEFAULT_VALIDATOR_CONFIG, ...config };
  }

  /**
   * Open challenge windows for all signals awaiting them.
   * Called after validator makes qualified/rejected decisions.
   */
  async openPendingWindows(): Promise<{
    opened: number;
    errors: Array<{ signalId: string; error: string }>;
  }> {
    const awaiting = await this.stateManager.getAwaitingChallengeWindow();
    let opened = 0;
    const errors: Array<{ signalId: string; error: string }> = [];

    for (const signal of awaiting) {
      try {
        await this.stateManager.openChallengeWindow(
          signal.signalId,
          this.config.challengeWindowDurationHours
        );
        opened++;
      } catch (err) {
        errors.push({
          signalId: signal.signalId,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    return { opened, errors };
  }

  /**
   * Finalize all signals with expired, unchallenged windows.
   */
  async finalizeExpiredWindows(): Promise<{
    finalized: number;
    errors: Array<{ signalId: string; error: string }>;
  }> {
    const readyForFinalization = await this.stateManager.getReadyForFinalization();
    let finalized = 0;
    const errors: Array<{ signalId: string; error: string }> = [];

    for (const signal of readyForFinalization) {
      try {
        await this.stateManager.finalizeUnchallenged(signal.signalId);
        finalized++;
      } catch (err) {
        errors.push({
          signalId: signal.signalId,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    return { finalized, errors };
  }

  /**
   * Get the status of a challenge window.
   */
  async getWindowStatus(signalId: string): Promise<ChallengeWindowStatus | null> {
    const state = await this.stateManager.getState(signalId);
    if (!state) return null;

    const isOpen = state.state === 'challenge_window';
    let remainingSeconds: number | undefined;

    if (isOpen && state.challengeWindowClosesAt) {
      const closesAt = new Date(state.challengeWindowClosesAt).getTime();
      const now = Date.now();
      remainingSeconds = Math.max(0, Math.floor((closesAt - now) / 1000));
    }

    return {
      signalId,
      isOpen,
      isChallenged: state.wasChallenged,
      openedAt: state.challengeWindowOpenedAt,
      closesAt: state.challengeWindowClosesAt,
      remainingSeconds,
      validatorDecision: state.validatorDecision
    };
  }

  /**
   * Get all signals currently in challenge window.
   */
  async getActiveWindows(): Promise<SignalValidatorState[]> {
    return this.stateManager.getInChallengeWindow();
  }

  /**
   * Get signals with open windows that haven't been challenged yet.
   */
  async getUnchallengedActiveWindows(): Promise<SignalValidatorState[]> {
    const active = await this.stateManager.getInChallengeWindow();
    return active.filter(s => !s.wasChallenged);
  }

  /**
   * Check if a signal's challenge window is still open.
   */
  async isWindowOpen(signalId: string): Promise<boolean> {
    const state = await this.stateManager.getState(signalId);
    if (!state || state.state !== 'challenge_window') return false;
    
    if (!state.challengeWindowClosesAt) return false;
    
    const closesAt = new Date(state.challengeWindowClosesAt).getTime();
    return Date.now() < closesAt;
  }

  /**
   * Get time remaining in challenge window (in seconds).
   */
  async getTimeRemaining(signalId: string): Promise<number | null> {
    const state = await this.stateManager.getState(signalId);
    if (!state || state.state !== 'challenge_window') return null;
    
    if (!state.challengeWindowClosesAt) return null;
    
    const closesAt = new Date(state.challengeWindowClosesAt).getTime();
    const remaining = Math.max(0, Math.floor((closesAt - Date.now()) / 1000));
    return remaining;
  }

  /**
   * Get summary statistics for challenge windows.
   */
  async getWindowStats(): Promise<{
    activeWindows: number;
    challengedCount: number;
    unchallengedCount: number;
    expiredUnchallenged: number;
  }> {
    const active = await this.stateManager.getInChallengeWindow();
    const readyForFinalization = await this.stateManager.getReadyForFinalization();
    
    const challenged = active.filter(s => s.wasChallenged);
    const unchallenged = active.filter(s => !s.wasChallenged);
    
    return {
      activeWindows: active.length,
      challengedCount: challenged.length,
      unchallengedCount: unchallenged.length,
      expiredUnchallenged: readyForFinalization.length
    };
  }
}
