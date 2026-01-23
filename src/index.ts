/**
 * AFI Mint Module
 * 
 * Signal validation and token minting coordination.
 * 
 * This module provides:
 * - Orchestrator: Signal state management, decay evaluation, challenge windows, mint gating
 * - Snapshot: Governance proposal creation and vote tracking
 * 
 * Usage:
 * ```typescript
 * import { 
 *   ValidatorDaemon,
 *   SignalStateManager,
 *   SnapshotClient 
 * } from '@afi-protocol/afi-mint';
 * ```
 */

// Re-export orchestrator module
export * from './orchestrator/index.js';

// Re-export snapshot module
export * from './snapshot/index.js';
