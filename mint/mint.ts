/**
 * Mint Flow Coordinator
 * 
 * High-level entry point for running the mint flow.
 * For full orchestration, use ValidatorDaemon from orchestrator module.
 */

import { ValidatorDaemon, DaemonRunStats } from '../src/orchestrator/ValidatorDaemon.js';

/**
 * Run a single mint flow cycle.
 * Returns statistics about the run.
 */
export async function runMintFlow(daemon: ValidatorDaemon): Promise<DaemonRunStats> {
  console.log('[MintFlow] Starting mint cycle...');
  const stats = await daemon.runOnce();
  console.log('[MintFlow] Cycle complete:', {
    decisions: stats.phases.validatorDecisions.processed,
    qualified: stats.phases.validatorDecisions.qualified,
    rejected: stats.phases.validatorDecisions.rejected,
    minted: stats.phases.minting.minted,
    errors: stats.errors.length
  });
  return stats;
}

/**
 * Start the mint daemon for continuous processing.
 */
export function startMintDaemon(daemon: ValidatorDaemon): void {
  console.log('[MintFlow] Starting daemon...');
  daemon.start();
}

/**
 * Stop the mint daemon.
 */
export function stopMintDaemon(daemon: ValidatorDaemon): void {
  console.log('[MintFlow] Stopping daemon...');
  daemon.stop();
}
