/**
 * Signal State Manager
 * 
 * Manages signal state transitions through the validator pipeline.
 * 
 * DESIGN:
 * - Validator makes automatic decision (qualified/rejected) based on AFI standards
 * - Determinations are mechanically verifiable; there is no appeal or dispute
 *   process (the challenge layer was retired by CHR-GOV D-CHR-1)
 * - Finalization follows qualification once the maturity hold has elapsed
 */

import type {
  SignalValidatorState,
  SignalValidatorStateKind,
  ValidatorDecisionKind
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
 * Valid state transitions in the validator pipeline.
 * 
 *   pending → qualified/rejected → finalized → minted/rejected_final
 */
const VALID_TRANSITIONS: Record<SignalValidatorStateKind, SignalValidatorStateKind[]> = {
  pending: ['qualified', 'rejected'],
  qualified: ['finalized'],
  rejected: ['finalized'],
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

  // ==================== FINALIZATION ====================

  /**
   * Finalize a signal after its decision (CHR-GOV D-CHR-2(3): qualification
   * complete and the maturity hold elapsed).
   */
  async finalize(signalId: string): Promise<SignalValidatorState> {
    const state = await this.store.get(signalId);
    if (!state) throw new Error(`Signal not found: ${signalId}`);
    const finalDecision = state.validatorDecision === 'qualified' ? 'mint' : 'reject';
    return this.transition(signalId, 'finalized', { finalDecision });
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
   * Get signals ready for finalization (decided; the maturity hold governs
   * when finalization may proceed — CHR-GOV D-CHR-2(3)).
   */
  async getReadyForFinalization(): Promise<SignalValidatorState[]> {
    const qualified = await this.store.listByState('qualified');
    const rejected = await this.store.listByState('rejected');
    return [...qualified, ...rejected];
  }

  /**
   * Get signals ready for minting (finalized with a mint decision).
   */
  async getReadyForMinting(): Promise<SignalValidatorState[]> {
    const finalized = await this.store.listByState('finalized');
    return finalized.filter(s => s.finalDecision === 'mint');
  }

  /**
   * Get signals ready for rejection (finalized with a reject decision).
   */
  async getReadyForRejection(): Promise<SignalValidatorState[]> {
    const finalized = await this.store.listByState('finalized');
    return finalized.filter(s => s.finalDecision === 'reject');
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
