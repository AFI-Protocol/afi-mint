import { describe, it, expect } from 'vitest';
import {
  EmissionsMintDataProvider,
  InMemoryEpochStateTracker,
  type ISignalMetadataFetcher,
  type SignalMintMetadata,
} from '../src/adapters/EmissionsMintDataProvider.js';
import type { SignalValidatorState } from '../src/orchestrator/types.js';

/**
 * Fixture outputs under the deterministic tokenUnitsToBaseUnits conversion policy.
 * Values marked "updated PR-4" differ from pre-PR-4 Math.floor(float×10^decimals)
 * artifacts only; mint formula and payout structure are unchanged.
 */
const BASELINE_FIXTURES = {
  invalidEpoch: 0n,
  singleDefaultMax: 1_000_000_000_000_000_000_000_000n,
  multiA: 2_280_846_332_886_131_000_000_000n, // updated PR-4
  multiB: 4_561_692_665_772_262_000_000_000n, // updated PR-4
  exhausted: 1_000_000_000_000_000_000n,
  pulse: 10_263_808_497_987_590_000_000_000n, // updated PR-4
  noPulse: 6_842_538_998_658_393_500_000_000n, // updated PR-4
} as const;

const HIGH_MAX_CONFIG = {
  minTokensPerSignal: 1n,
  maxTokensPerSignal: 999_999_999_999_999_999_999_999_999_999n,
  decimals: 18,
  epochPulseFactor: 1.0,
};

function makeFetcher(meta: SignalMintMetadata): ISignalMetadataFetcher {
  return {
    getMetadata: async (signalId: string) => (signalId === meta.signalId ? meta : null),
  };
}

function signalState(signalId: string): SignalValidatorState {
  return { signalId } as SignalValidatorState;
}

function metadata(
  signalId: string,
  epoch: number,
  qualityScore = 1,
  noveltyFactor = 1,
  reputationWeight = 1
): SignalMintMetadata {
  return {
    signalId,
    beneficiary: '0xabc',
    epoch,
    receiptId: 1n,
    qualityScore,
    noveltyFactor,
    reputationWeight,
  };
}

describe('EmissionsMintDataProvider.calculateTokenAmount', () => {
  it('returns 0n for invalid or past-schedule epoch', async () => {
    const tracker = new InMemoryEpochStateTracker();
    const provider = new EmissionsMintDataProvider(
      makeFetcher(metadata('s1', 9999)),
      tracker,
      HIGH_MAX_CONFIG
    );

    await expect(provider.calculateTokenAmount(signalState('s1'))).resolves.toBe(
      BASELINE_FIXTURES.invalidEpoch
    );
  });

  it('allocates a single signal against the full remaining epoch budget (default max clamp)', async () => {
    const tracker = new InMemoryEpochStateTracker();
    tracker.addSignalWeight(1, 1);
    const provider = new EmissionsMintDataProvider(
      makeFetcher(metadata('s2', 1)),
      tracker
    );

    await expect(provider.calculateTokenAmount(signalState('s2'))).resolves.toBe(
      BASELINE_FIXTURES.singleDefaultMax
    );
  });

  it('shares epoch budget proportionally by Q×N×R over totalWeight', async () => {
    const trackerA = new InMemoryEpochStateTracker();
    trackerA.addSignalWeight(2756, 3);
    const providerA = new EmissionsMintDataProvider(
      makeFetcher(metadata('a', 2756, 1, 1, 1)),
      trackerA,
      HIGH_MAX_CONFIG
    );

    const trackerB = new InMemoryEpochStateTracker();
    trackerB.addSignalWeight(2756, 3);
    const providerB = new EmissionsMintDataProvider(
      makeFetcher(metadata('b', 2756, 2, 1, 1)),
      trackerB,
      HIGH_MAX_CONFIG
    );

    const amountA = await providerA.calculateTokenAmount(signalState('a'));
    const amountB = await providerB.calculateTokenAmount(signalState('b'));

    expect(amountA).toBe(BASELINE_FIXTURES.multiA);
    expect(amountB).toBe(BASELINE_FIXTURES.multiB);
    expect(amountB).toBe(amountA * 2n);
  });

  it('returns minTokensPerSignal when epoch budget is exhausted', async () => {
    const tracker = new InMemoryEpochStateTracker();
    tracker.addSignalWeight(1, 1);
    const probe = new EmissionsMintDataProvider(makeFetcher(metadata('x', 1)), tracker);
    const budget = probe.getEpochBudget(1);
    tracker.recordMint(1, budget);

    const provider = new EmissionsMintDataProvider(makeFetcher(metadata('x', 1)), tracker);
    await expect(provider.calculateTokenAmount(signalState('x'))).resolves.toBe(
      BASELINE_FIXTURES.exhausted
    );
  });

  it('scales payout by epochPulseFactor', async () => {
    const trackerPulse = new InMemoryEpochStateTracker();
    trackerPulse.addSignalWeight(2756, 1);
    const providerPulse = new EmissionsMintDataProvider(
      makeFetcher(metadata('p', 2756)),
      trackerPulse,
      { ...HIGH_MAX_CONFIG, epochPulseFactor: 1.5 }
    );

    const trackerNeutral = new InMemoryEpochStateTracker();
    trackerNeutral.addSignalWeight(2756, 1);
    const providerNeutral = new EmissionsMintDataProvider(
      makeFetcher(metadata('p', 2756)),
      trackerNeutral,
      HIGH_MAX_CONFIG
    );

    const pulseAmount = await providerPulse.calculateTokenAmount(signalState('p'));
    const neutralAmount = await providerNeutral.calculateTokenAmount(signalState('p'));

    expect(pulseAmount).toBe(BASELINE_FIXTURES.pulse);
    expect(neutralAmount).toBe(BASELINE_FIXTURES.noPulse);
    expect(pulseAmount).toBeGreaterThan(neutralAmount);
  });
});
