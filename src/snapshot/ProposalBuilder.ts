/**
 * Proposal Builder
 * 
 * Builds Snapshot governance proposals from signal validator state.
 * Formats signal data for challenge voting.
 */

import type { CreateProposalParams, SnapshotProposalType } from './SnapshotClient.js';
import type { SignalValidatorState } from '../orchestrator/types.js';
import { DEFAULT_VALIDATOR_CONFIG } from '../orchestrator/types.js';

/**
 * Signal metadata for proposal body.
 */
export interface SignalProposalMetadata {
  signalId: string;
  analystId?: string;
  market?: string;
  baseScore: number;
  decayScore: number;
  ageHours: number;
  halfLifeHours: number;
  decayPassAt: string;
}

/**
 * Proposal builder configuration.
 */
export interface ProposalBuilderConfig {
  spaceId: string;
  challengeWindowDurationHours: number;
  proposalType: SnapshotProposalType;
}

/**
 * Default proposal builder configuration.
 */
const DEFAULT_BUILDER_CONFIG: ProposalBuilderConfig = {
  spaceId: DEFAULT_VALIDATOR_CONFIG.snapshotSpaceId,
  challengeWindowDurationHours: DEFAULT_VALIDATOR_CONFIG.challengeWindowDurationHours,
  proposalType: 'single-choice'
};

/**
 * Proposal Builder
 * 
 * Creates Snapshot proposals for signal challenge windows:
 * 1. Formats signal metadata into readable proposal body
 * 2. Sets voting window based on config
 * 3. Configures standard AFI voting choices
 */
export class ProposalBuilder {
  private readonly config: ProposalBuilderConfig;

  constructor(config?: Partial<ProposalBuilderConfig>) {
    this.config = { ...DEFAULT_BUILDER_CONFIG, ...config };
  }

  /**
   * Build a proposal from signal validator state.
   */
  buildProposal(
    signal: SignalValidatorState,
    snapshotBlock: string,
    additionalMetadata?: Record<string, unknown>
  ): CreateProposalParams {
    const title = this.buildTitle(signal);
    const body = this.buildBody(signal, additionalMetadata);
    const { start, end } = this.calculateVotingWindow();

    return {
      space: this.config.spaceId,
      title,
      body,
      choices: ['For', 'Against', 'Abstain'],
      start,
      end,
      snapshot: snapshotBlock,
      type: this.config.proposalType,
      metadata: {
        signalId: signal.signalId,
        baseScore: signal.baseScore,
        decayScore: signal.decayScore,
        ...additionalMetadata
      }
    };
  }

  /**
   * Build proposal title.
   */
  buildTitle(signal: SignalValidatorState): string {
    const shortId = signal.signalId.slice(0, 8);
    const scoreDisplay = signal.decayScore?.toFixed(2) ?? 'N/A';
    return `[AFI Challenge] Signal ${shortId} - Decay Score: ${scoreDisplay}`;
  }

  /**
   * Build proposal body with signal details.
   */
  buildBody(
    signal: SignalValidatorState,
    additionalMetadata?: Record<string, unknown>
  ): string {
    const metadata = this.extractMetadata(signal);

    let body = `## Signal Challenge Proposal

This proposal initiates a challenge window for signal validation and potential token minting.

### Signal Details

| Field | Value |
|-------|-------|
| Signal ID | \`${metadata.signalId}\` |
| Base Score | ${metadata.baseScore.toFixed(4)} |
| Decay Score | ${metadata.decayScore.toFixed(4)} |
| Age | ${metadata.ageHours.toFixed(2)} hours |
| Half-Life | ${metadata.halfLifeHours} hours |
| Decay Pass | ${metadata.decayPassAt} |

### Voting Options

- **For**: Approve signal for token minting
- **Against**: Reject signal (no minting)
- **Abstain**: Neutral vote (counts toward quorum)

### Challenge Period

This proposal will remain open for ${this.config.challengeWindowDurationHours} hours.

---

*AFI Protocol Signal Validator v1.0*
`;

    if (additionalMetadata) {
      body += `\n### Additional Metadata\n\n\`\`\`json\n${JSON.stringify(additionalMetadata, null, 2)}\n\`\`\`\n`;
    }

    return body;
  }

  /**
   * Extract metadata from signal state.
   */
  extractMetadata(signal: SignalValidatorState): SignalProposalMetadata {
    return {
      signalId: signal.signalId,
      baseScore: signal.baseScore ?? 0,
      decayScore: signal.decayScore ?? 0,
      ageHours: signal.ageHours ?? 0,
      halfLifeHours: signal.halfLifeHours ?? 24,
      decayPassAt: signal.decisionAt ?? new Date().toISOString()
    };
  }

  /**
   * Calculate voting window timestamps.
   */
  calculateVotingWindow(): { start: number; end: number } {
    const now = Math.floor(Date.now() / 1000);
    const durationSeconds = this.config.challengeWindowDurationHours * 60 * 60;

    return {
      start: now,
      end: now + durationSeconds
    };
  }

  /**
   * Build a proposal for multiple signals (batch challenge).
   */
  buildBatchProposal(
    signals: SignalValidatorState[],
    snapshotBlock: string
  ): CreateProposalParams {
    const signalIds = signals.map(s => s.signalId.slice(0, 8)).join(', ');
    const title = `[AFI Batch Challenge] ${signals.length} Signals: ${signalIds}`;

    let body = `## Batch Signal Challenge Proposal

This proposal initiates a challenge window for ${signals.length} signals.

### Signals

| Signal ID | Base Score | Decay Score | Age (hrs) |
|-----------|------------|-------------|-----------|
`;

    for (const signal of signals) {
      const meta = this.extractMetadata(signal);
      body += `| \`${meta.signalId.slice(0, 8)}\` | ${meta.baseScore.toFixed(4)} | ${meta.decayScore.toFixed(4)} | ${meta.ageHours.toFixed(1)} |\n`;
    }

    body += `
### Voting Options

- **For**: Approve all signals for token minting
- **Against**: Reject all signals (no minting)
- **Abstain**: Neutral vote (counts toward quorum)

### Challenge Period

This proposal will remain open for ${this.config.challengeWindowDurationHours} hours.

---

*AFI Protocol Signal Validator v1.0*
`;

    const { start, end } = this.calculateVotingWindow();

    return {
      space: this.config.spaceId,
      title,
      body,
      choices: ['For', 'Against', 'Abstain'],
      start,
      end,
      snapshot: snapshotBlock,
      type: this.config.proposalType,
      metadata: {
        signalIds: signals.map(s => s.signalId),
        isBatch: true,
        signalCount: signals.length
      }
    };
  }
}
