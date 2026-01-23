/**
 * Mint Executor
 * 
 * Executes final minting and rejection for signals that have completed
 * the validation pipeline (either unchallenged or dispute-resolved).
 * 
 * DESIGN:
 * - Processes signals with finalDecision = 'mint' → mint tokens
 * - Processes signals with finalDecision = 'reject' → mark as rejected
 * - Calls AFIMintCoordinator.mintForSignal() for approved signals
 */

import type { SignalStateManager } from './SignalStateManager.js';
import type { SignalValidatorState } from './types.js';

/**
 * Mint request parameters (matches on-chain struct).
 */
export interface MintRequest {
  beneficiary: string;
  tokenAmount: bigint;
  receiptId: bigint;
  receiptAmount: bigint;
  signalId: string;
  epoch: bigint;
  extraData: string;
}

/**
 * On-chain mint coordinator interface.
 */
export interface IMintCoordinatorContract {
  mintForSignal(request: MintRequest): Promise<{
    txHash: string;
    gasUsed: bigint;
  }>;
}

/**
 * Data provider for mint request parameters.
 */
export interface IMintDataProvider {
  getBeneficiary(signalId: string): Promise<string>;
  calculateTokenAmount(signal: SignalValidatorState): Promise<bigint>;
  getEpoch(signalId: string): Promise<bigint>;
  getReceiptId(signalId: string): Promise<bigint>;
}

/**
 * Mint Executor
 * 
 * Handles final execution of minting and rejection.
 */
export class MintExecutor {
  constructor(
    private readonly stateManager: SignalStateManager,
    private readonly contract: IMintCoordinatorContract,
    private readonly dataProvider: IMintDataProvider
  ) {}

  /**
   * Process all signals ready for minting or rejection.
   */
  async processReadySignals(): Promise<{
    minted: number;
    rejected: number;
    errors: number;
  }> {
    let minted = 0;
    let rejected = 0;
    let errors = 0;

    // Process signals ready for minting
    const readyForMint = await this.stateManager.getReadyForMinting();
    for (const signal of readyForMint) {
      try {
        await this.executeMint(signal);
        minted++;
      } catch (err) {
        errors++;
      }
    }

    // Process signals ready for rejection
    const readyForReject = await this.stateManager.getReadyForRejection();
    for (const signal of readyForReject) {
      try {
        await this.executeRejection(signal);
        rejected++;
      } catch (err) {
        errors++;
      }
    }

    return { minted, rejected, errors };
  }

  /**
   * Execute minting for a single signal.
   */
  async executeMint(signal: SignalValidatorState): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }> {
    try {
      const request = await this.buildMintRequest(signal);
      const { txHash } = await this.contract.mintForSignal(request);
      
      await this.stateManager.markMinted(signal.signalId, txHash);
      
      return { success: true, txHash };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Execute rejection for a single signal.
   */
  async executeRejection(signal: SignalValidatorState): Promise<{
    success: boolean;
  }> {
    const reason = signal.wasChallenged && signal.disputeOutcome?.challengeSucceeded
      ? 'Rejected after successful challenge'
      : signal.decisionReason ?? 'Did not meet scoring threshold';

    await this.stateManager.markRejectedFinal(signal.signalId, reason);
    return { success: true };
  }

  /**
   * Build mint request from signal data.
   */
  async buildMintRequest(signal: SignalValidatorState): Promise<MintRequest> {
    const beneficiary = await this.dataProvider.getBeneficiary(signal.signalId);
    const tokenAmount = await this.dataProvider.calculateTokenAmount(signal);
    const epoch = await this.dataProvider.getEpoch(signal.signalId);
    const receiptId = await this.dataProvider.getReceiptId(signal.signalId);

    return {
      beneficiary,
      tokenAmount,
      receiptId,
      receiptAmount: 1n,
      signalId: signal.signalId,
      epoch,
      extraData: '0x'
    };
  }

  /**
   * Get minting statistics.
   */
  async getStats(): Promise<{
    pendingMint: number;
    pendingReject: number;
    totalMinted: number;
    totalRejected: number;
  }> {
    const pendingMint = (await this.stateManager.getReadyForMinting()).length;
    const pendingReject = (await this.stateManager.getReadyForRejection()).length;
    const minted = (await this.stateManager.getSignalsByState('minted')).length;
    const rejected = (await this.stateManager.getSignalsByState('rejected_final')).length;

    return {
      pendingMint,
      pendingReject,
      totalMinted: minted,
      totalRejected: rejected
    };
  }

  /**
   * Retry a failed mint.
   */
  async retryMint(signalId: string): Promise<{
    success: boolean;
    txHash?: string;
    error?: string;
  }> {
    const state = await this.stateManager.getState(signalId);
    if (!state) {
      return { success: false, error: 'Signal not found' };
    }

    if (state.finalDecision !== 'mint') {
      return { success: false, error: 'Signal is not approved for minting' };
    }

    if (state.state === 'minted') {
      return { success: false, error: 'Signal already minted' };
    }

    return this.executeMint(state);
  }
}
