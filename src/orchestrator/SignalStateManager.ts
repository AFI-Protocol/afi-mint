/**
 * Signal State Manager
 * 
 * Manages signal state transitions through the appeal-based validator pipeline.
 * 
 * DESIGN:
 * - Validator makes automatic decision (qualified/rejected) based on AFI standards
 * - Challenge window opens for appeals
 * - If unchallenged: auto-finalize based on original decision
 * - If challenged: dispute resolution via voting, then finalize
 */

import type {
  SignalValidatorState,
  SignalValidatorStateKind,
  ValidatorDecisionKind,
  ChallengeSubmission,
  DisputeOutcome,
  VoteResult
} from './types.js';

/**
 * State transition event for audit logging.
 */
export interface StateTransitionEvent {
  signalId: string;
  fromState: SignalValidatorStateKind;
  toState: SignalValidatorStateKind;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/**
 * Valid state transitions in the appeal-based validator pipeline.
 * 
 * Happy path (no challenge):
 *   pending → qualified/rejected → challenge_window → finalized → minted/rejected_final
 * 
 * Contested path:
 *   challenge_window → contested → dispute_resolved → minted/rejected_final
 */
const VALID_TRANSITIONS: Record<SignalValidatorStateKind, SignalValidatorStateKind[]> = {
  pending: ['qualified', 'rejected'],
  qualified: ['challenge_window'],
  rejected: ['challenge_window'],
  challenge_window: ['finalized', 'contested'], // finalized if unchallenged, contested if challenged
  contested: ['dispute_resolved'],
  dispute_resolved: ['minted', 'rejected_final'],
  finalized: ['minted', 'rejected_final'],
  minted: [], // Terminal state
  rejected_final: [] // Terminal state
};

/**
 * Persistence interface for signal validator states.
 */
export interface ISignalStateStore {
  get(signalId: string): Promise<SignalValidatorState | null>;
  upsert(state: SignalValidatorState): Promise<void>;
  query(filter: Partial<SignalValidatorState>): Promise<SignalValidatorState[]>;
  listByState(state: SignalValidatorStateKind): Promise<SignalValidatorState[]>;
}

/**
 * In-memory implementation of signal state store.
 */
export class InMemorySignalStateStore implements ISignalStateStore {
  private states = new Map<string, SignalValidatorState>();

  async get(signalId: string): Promise<SignalValidatorState | null> {
    return this.states.get(signalId) ?? null;
  }

  async upsert(state: SignalValidatorState): Promise<void> {
    this.states.set(state.signalId, { ...state, updatedAt: new Date().toISOString() });
  }

  async query(filter: Partial<SignalValidatorState>): Promise<SignalValidatorState[]> {
    return Array.from(this.states.values()).filter(s => {
      for (const [key, value] of Object.entries(filter)) {
        if (s[key as keyof SignalValidatorState] !== value) return false;
      }
      return true;
    });
  }

  async listByState(state: SignalValidatorStateKind): Promise<SignalValidatorState[]> {
    return this.query({ state });
  }
}

/**
 * Logger interface for transition events.
 */
export interface ITransitionLogger {
  log(event: StateTransitionEvent): void;
}

/**
 * Console-based transition logger.
 */
export class ConsoleTransitionLogger implements ITransitionLogger {
  log(event: StateTransitionEvent): void {
    console.log(`[StateTransition] ${event.signalId}: ${event.fromState} → ${event.toState} @ ${event.timestamp}`);
  }
}

/**
 * Signal State Manager
 * 
 * Coordinates signal state transitions with validation and persistence.
 */
export class SignalStateManager {
  constructor(
    private readonly store: ISignalStateStore,
    private readonly logger?: ITransitionLogger
  ) {}

  /**
   * Initialize a new signal in PENDING state.
   */
  async initSignal(signalId: string, baseScore?: number): Promise<SignalValidatorState> {
    const existing = await this.store.get(signalId);
    if (existing) {
      throw new Error(`Signal ${signalId} already exists in state: ${existing.state}`);
    }

    const now = new Date().toISOString();
    const state: SignalValidatorState = {
      signalId,
      state: 'pending',
      baseScore,
      wasChallenged: false,
      createdAt: now,
      updatedAt: now
    };

    await this.store.upsert(state);
    return state;
  }

  /**
   * Get current state for a signal.
   */
  async getState(signalId: string): Promise<SignalValidatorState | null> {
    return this.store.get(signalId);
  }

  /**
   * Validate that a state transition is allowed.
   */
  isValidTransition(from: SignalValidatorStateKind, to: SignalValidatorStateKind): boolean {
    return VALID_TRANSITIONS[from]?.includes(to) ?? false;
  }

  // ==================== VALIDATOR DECISION ====================

  /**
   * Record validator's automatic decision (qualified or rejected).
   */
  async recordValidatorDecision(
    signalId: string,
    decision: ValidatorDecisionKind,
    scoring: {
      decayScore: number;
      baseScore: number;
      ageHours: number;
      halfLifeHours: number;
    },
    reason: string
  ): Promise<SignalValidatorState> {
    const targetState = decision === 'qualified' ? 'qualified' : 'rejected';
    
    return this.transition(signalId, targetState, {
      validatorDecision: decision,
      decisionAt: new Date().toISOString(),
      decisionReason: reason,
      decayScore: scoring.decayScore,
      baseScore: scoring.baseScore,
      ageHours: scoring.ageHours,
      halfLifeHours: scoring.halfLifeHours
    });
  }

  // ==================== CHALLENGE WINDOW ====================

  /**
   * Open the challenge window for a signal.
   */
  async openChallengeWindow(
    signalId: string,
    windowDurationHours: number
  ): Promise<SignalValidatorState> {
    const now = new Date();
    const closesAt = new Date(now.getTime() + windowDurationHours * 60 * 60 * 1000);

    return this.transition(signalId, 'challenge_window', {
      challengeWindowOpenedAt: now.toISOString(),
      challengeWindowClosesAt: closesAt.toISOString()
    });
  }

  /**
   * Submit a challenge (contest the validator decision).
   */
  async submitChallenge(
    signalId: string,
    challenge: ChallengeSubmission
  ): Promise<SignalValidatorState> {
    const state = await this.store.get(signalId);
    if (!state) {
      throw new Error(`Signal ${signalId} not found`);
    }

    if (state.state !== 'challenge_window') {
      throw new Error(`Signal ${signalId} is in state ${state.state}, can only challenge during challenge_window`);
    }

    // Check if challenge window is still open
    if (state.challengeWindowClosesAt) {
      const closesAt = new Date(state.challengeWindowClosesAt).getTime();
      if (Date.now() > closesAt) {
        throw new Error(`Challenge window for ${signalId} has closed`);
      }
    }

    return this.transition(signalId, 'contested', {
      challenge,
      wasChallenged: true
    });
  }

  /**
   * Finalize an unchallenged signal (challenge window closed without contest).
   */
  async finalizeUnchallenged(signalId: string): Promise<SignalValidatorState> {
    const state = await this.store.get(signalId);
    if (!state) {
      throw new Error(`Signal ${signalId} not found`);
    }

    if (state.state !== 'challenge_window') {
      throw new Error(`Signal ${signalId} is in state ${state.state}, expected challenge_window`);
    }

    if (state.wasChallenged) {
      throw new Error(`Signal ${signalId} was challenged, cannot finalize as unchallenged`);
    }

    // Set final decision based on original validator decision
    const finalDecision = state.validatorDecision === 'qualified' ? 'mint' : 'reject';

    return this.transition(signalId, 'finalized', {
      finalDecision
    });
  }

  // ==================== DISPUTE RESOLUTION ====================

  /**
   * Record dispute outcome after voting completes.
   */
  async recordDisputeOutcome(
    signalId: string,
    voteResult: VoteResult,
    challengeSucceeded: boolean
  ): Promise<SignalValidatorState> {
    const state = await this.store.get(signalId);
    if (!state) {
      throw new Error(`Signal ${signalId} not found`);
    }

    const disputeOutcome: DisputeOutcome = {
      challengeSucceeded,
      voteResult,
      resolvedAt: new Date().toISOString(),
      challengerRewarded: challengeSucceeded
    };

    // Determine final decision:
    // - If challenge succeeded: OVERTURN original decision
    // - If challenge failed: UPHOLD original decision
    let finalDecision: 'mint' | 'reject';
    if (challengeSucceeded) {
      // Overturn: qualified → reject, rejected → mint
      finalDecision = state.validatorDecision === 'qualified' ? 'reject' : 'mint';
    } else {
      // Uphold: qualified → mint, rejected → reject
      finalDecision = state.validatorDecision === 'qualified' ? 'mint' : 'reject';
    }

    return this.transition(signalId, 'dispute_resolved', {
      disputeOutcome,
      finalDecision
    });
  }

  // ==================== FINALIZATION ====================

  /**
   * Mark signal as minted.
   */
  async markMinted(signalId: string, mintTxHash: string): Promise<SignalValidatorState> {
    return this.transition(signalId, 'minted', { mintTxHash });
  }

  /**
   * Mark signal as definitively rejected.
   */
  async markRejectedFinal(signalId: string, reason?: string): Promise<SignalValidatorState> {
    return this.transition(signalId, 'rejected_final', { 
      rejectionReason: reason 
    });
  }

  // ==================== QUERIES ====================

  /**
   * Get signals by state.
   */
  async getSignalsByState(state: SignalValidatorStateKind): Promise<SignalValidatorState[]> {
    return this.store.listByState(state);
  }

  /**
   * Get signals pending validator decision.
   */
  async getPendingSignals(): Promise<SignalValidatorState[]> {
    return this.store.listByState('pending');
  }

  /**
   * Get signals awaiting challenge window opening.
   */
  async getAwaitingChallengeWindow(): Promise<SignalValidatorState[]> {
    const qualified = await this.store.listByState('qualified');
    const rejected = await this.store.listByState('rejected');
    return [...qualified, ...rejected];
  }

  /**
   * Get signals in challenge window.
   */
  async getInChallengeWindow(): Promise<SignalValidatorState[]> {
    return this.store.listByState('challenge_window');
  }

  /**
   * Get signals with active disputes.
   */
  async getContestedSignals(): Promise<SignalValidatorState[]> {
    return this.store.listByState('contested');
  }

  /**
   * Get signals ready for finalization (unchallenged, window closed).
   */
  async getReadyForFinalization(): Promise<SignalValidatorState[]> {
    const inWindow = await this.store.listByState('challenge_window');
    const now = Date.now();
    
    return inWindow.filter(s => {
      if (s.wasChallenged) return false;
      if (!s.challengeWindowClosesAt) return false;
      return now >= new Date(s.challengeWindowClosesAt).getTime();
    });
  }

  /**
   * Get signals ready for minting (finalized or dispute resolved with mint decision).
   */
  async getReadyForMinting(): Promise<SignalValidatorState[]> {
    const finalized = await this.store.listByState('finalized');
    const disputeResolved = await this.store.listByState('dispute_resolved');
    
    return [...finalized, ...disputeResolved].filter(s => s.finalDecision === 'mint');
  }

  /**
   * Get signals ready for rejection (finalized or dispute resolved with reject decision).
   */
  async getReadyForRejection(): Promise<SignalValidatorState[]> {
    const finalized = await this.store.listByState('finalized');
    const disputeResolved = await this.store.listByState('dispute_resolved');
    
    return [...finalized, ...disputeResolved].filter(s => s.finalDecision === 'reject');
  }

  // ==================== INTERNAL ====================

  /**
   * Internal transition helper with validation and logging.
   */
  private async transition(
    signalId: string,
    toState: SignalValidatorStateKind,
    updates: Partial<SignalValidatorState>
  ): Promise<SignalValidatorState> {
    const current = await this.store.get(signalId);
    if (!current) {
      throw new Error(`Signal ${signalId} not found`);
    }

    if (!this.isValidTransition(current.state, toState)) {
      throw new Error(
        `Invalid transition for ${signalId}: ${current.state} → ${toState}. ` +
        `Valid transitions: ${VALID_TRANSITIONS[current.state].join(', ') || 'none (terminal state)'}`
      );
    }

    const event: StateTransitionEvent = {
      signalId,
      fromState: current.state,
      toState,
      timestamp: new Date().toISOString(),
      metadata: updates
    };

    const updated: SignalValidatorState = {
      ...current,
      ...updates,
      state: toState,
      updatedAt: event.timestamp
    };

    await this.store.upsert(updated);
    this.logger?.log(event);

    return updated;
  }
}
