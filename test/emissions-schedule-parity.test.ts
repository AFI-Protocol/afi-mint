import { describe, it, expect } from 'vitest';
import { emissions } from '@afi-protocol/afi-math';
import { EmissionsMintDataProvider, InMemoryEpochStateTracker } from '../src/adapters/EmissionsMintDataProvider.js';
import golden from './fixtures/emissions.golden.json';

const REL_TOL = 1e-12;
const KEY_EPOCHS = [1, 2, 208, 209, 1456, 1457, 2756] as const;

function expectRelClose(actual: number, expected: number, relTol: number = REL_TOL): void {
  if (expected === 0) {
    expect(actual).toBe(0);
    return;
  }
  const relErr = Math.abs(actual - expected) / Math.abs(expected);
  expect(relErr).toBeLessThanOrEqual(relTol);
}

describe('Emissions schedule parity (afi-math consumer)', () => {
  const schedule = emissions.buildEmissionsSchedule();
  const g = golden.defaultSchedule;

  it('should produce 2756 total epochs by default', () => {
    expect(schedule.totalEpochs).toBe(2756);
    expect(schedule.totalEpochs).toBe(g.totalEpochs);
  });

  it('should match afi-math PR-1 milestone facts exactly', () => {
    expect(schedule.milestones).toEqual(g.milestones);
  });

  it.each(KEY_EPOCHS)('should match golden emission at epoch %i', (epoch) => {
    const expected = g.emissionsAtEpochs[String(epoch) as keyof typeof g.emissionsAtEpochs];
    expectRelClose(schedule.emissions[epoch - 1], expected);
    expectRelClose(emissions.getEpochEmission(schedule, epoch), expected);
  });

  it('should sum per-epoch emissions to the cap within relative 1e-9', () => {
    const sum = schedule.emissions.reduce((acc, e) => acc + e, 0);
    expectRelClose(sum, g.sumOfEmissions, 1e-9);
  });

  it('should match provider getEpochBudget to afi-math getEpochEmission for key epochs', () => {
    const tracker = new InMemoryEpochStateTracker();
    const fetcher = { getMetadata: async () => null };
    const provider = new EmissionsMintDataProvider(fetcher, tracker);

    for (const epoch of KEY_EPOCHS) {
      const expected = g.emissionsAtEpochs[String(epoch) as keyof typeof g.emissionsAtEpochs];
      expectRelClose(provider.getEpochBudget(epoch), expected);
      expectRelClose(
        provider.getEpochBudget(epoch),
        emissions.getEpochEmission(provider.getSchedule(), epoch)
      );
    }
  });

  it('should be bit-identical to afi-math default schedule emissions array', () => {
    const mathSchedule = emissions.buildEmissionsSchedule();
    const providerSchedule = new EmissionsMintDataProvider(
      { getMetadata: async () => null },
      new InMemoryEpochStateTracker()
    ).getSchedule();

    expect(providerSchedule.totalEpochs).toBe(mathSchedule.totalEpochs);
    for (let i = 0; i < mathSchedule.emissions.length; i++) {
      expect(Object.is(providerSchedule.emissions[i], mathSchedule.emissions[i])).toBe(true);
    }
  });
});
