/**
 * Emissions-Based Mint Data Provider
 * 
 * Implements IMintDataProvider using the canonical AFI emissions schedule.
 * Calculates per-signal token amounts based on:
 * - Epoch emissions budget (from three-phase front-loaded schedule)
 * - Signal quality scores (decay score, novelty, reputation)
 * - Proportional distribution among qualified signals in the epoch
 * 
 * Based on the goldpaper formula:
 * ΔAFIᵢ = clamp(B(t) × Qᵢ × Nᵢ × R_val,i × E_epoch, 0.5×B(t), 2.0×B(t))
 */

import type { IMintDataProvider } from '../orchestrator/MintExecutor.js';
import type { SignalValidatorState } from '../orchestrator/types.js';

// ============================================================================
// Emissions Schedule Types and Functions
// Inlined from afi-math to avoid circular dependency issues.
// Canonical source: afi-math/src/emissions/emissionsSchedule.ts
// ============================================================================

export interface EmissionsParams {
  cap: bigint;
  epochsPerYear: number;
  earlyYears: number;
  midYears: number;
  tailYears: number;
  targets: { f33: number; f80: number; f100: number };
  shapeEarly: number;
  shapeMid: number;
  shapeTail: number;
}

export interface EmissionsSchedule {
  params: EmissionsParams;
  totalEpochs: number;
  emissions: number[];
  cumulative: number[];
  milestones: {
    epochTo33Pct: number;
    epochTo80Pct: number;
    epochTo100Pct: number;
    yearsTo33Pct: number;
    yearsTo80Pct: number;
    yearsTo100Pct: number;
  };
}

const DEFAULT_EMISSIONS_PARAMS: EmissionsParams = {
  cap: 86_000_000_000n,
  epochsPerYear: 52,
  earlyYears: 4,
  midYears: 24,
  tailYears: 25,
  targets: { f33: 1 / 3, f80: 0.8, f100: 1.0 },
  shapeEarly: 2.0,
  shapeMid: 1.5,
  shapeTail: 1.2,
};

function shapeWeights(n: number, shape: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [1.0];
  const weights: number[] = [];
  const denominator = Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    weights.push(Math.exp(-shape * (i / denominator)));
  }
  const total = weights.reduce((sum, w) => sum + w, 0);
  return weights.map(w => w / total);
}

function toEpochs(years: number, epochsPerYear: number): number {
  return Math.max(1, Math.round(years * epochsPerYear));
}

function buildEmissionsSchedule(params: Partial<EmissionsParams> = {}): EmissionsSchedule {
  const p: EmissionsParams = { ...DEFAULT_EMISSIONS_PARAMS, ...params };
  const cap = Number(p.cap);
  const nEarly = toEpochs(p.earlyYears, p.epochsPerYear);
  const nMid = toEpochs(p.midYears, p.epochsPerYear);
  const nTail = toEpochs(p.tailYears, p.epochsPerYear);
  const totalEpochs = nEarly + nMid + nTail;

  const wEarly = shapeWeights(nEarly, p.shapeEarly);
  const wMid = shapeWeights(nMid, p.shapeMid);
  const wTail = shapeWeights(nTail, p.shapeTail);

  const supplyEarly = cap * p.targets.f33;
  const supplyMid = cap * (p.targets.f80 - p.targets.f33);
  const supplyTail = cap * (p.targets.f100 - p.targets.f80);

  const baseEmissions: number[] = [
    ...wEarly.map(w => w * supplyEarly),
    ...wMid.map(w => w * supplyMid),
    ...wTail.map(w => w * supplyTail),
  ];

  const baseTotal = baseEmissions.reduce((sum, e) => sum + e, 0);
  const scale = cap / baseTotal;
  const emissions = baseEmissions.map(e => e * scale);

  const cumulative: number[] = [];
  let runningTotal = 0;
  for (const e of emissions) {
    runningTotal += e;
    cumulative.push(runningTotal);
  }

  const findMilestoneEpoch = (targetFraction: number): number => {
    const target = cap * targetFraction;
    const idx = cumulative.findIndex(c => c >= target);
    return idx >= 0 ? idx + 1 : totalEpochs;
  };

  return {
    params: p,
    totalEpochs,
    emissions,
    cumulative,
    milestones: {
      epochTo33Pct: findMilestoneEpoch(p.targets.f33),
      epochTo80Pct: findMilestoneEpoch(p.targets.f80),
      epochTo100Pct: findMilestoneEpoch(p.targets.f100),
      yearsTo33Pct: findMilestoneEpoch(p.targets.f33) / p.epochsPerYear,
      yearsTo80Pct: findMilestoneEpoch(p.targets.f80) / p.epochsPerYear,
      yearsTo100Pct: findMilestoneEpoch(p.targets.f100) / p.epochsPerYear,
    },
  };
}

function getEpochEmission(schedule: EmissionsSchedule, epoch: number): number {
  if (epoch < 1 || epoch > schedule.totalEpochs) return 0;
  return schedule.emissions[epoch - 1];
}

// ============================================================================
// End of inlined emissions schedule code
// ============================================================================

/**
 * Signal metadata required for token calculation.
 */
export interface SignalMintMetadata {
  signalId: string;
  /** Address to receive minted tokens */
  beneficiary: string;
  /** Epoch when signal was validated */
  epoch: number;
  /** Receipt ID linking to AFISignalReceipt */
  receiptId: bigint;
  /** Quality score (0-1, from decay score or composite) */
  qualityScore: number;
  /** Novelty factor (0-2+, multiplier for novel signals) */
  noveltyFactor: number;
  /** Validator reputation weight (0-2, based on validator performance) */
  reputationWeight: number;
}

/**
 * Interface for fetching signal metadata from TSSD vault.
 */
export interface ISignalMetadataFetcher {
  getMetadata(signalId: string): Promise<SignalMintMetadata | null>;
}

/**
 * Interface for tracking epoch state and signal counts.
 */
export interface IEpochStateTracker {
  /** Get current epoch number */
  getCurrentEpoch(): Promise<number>;
  /** Get total quality-weighted signals in an epoch (for proportional distribution) */
  getEpochTotalWeight(epoch: number): Promise<number>;
  /** Get amount already minted in an epoch */
  getEpochMintedAmount(epoch: number): Promise<number>;
}

/**
 * Configuration for the emissions mint data provider.
 */
export interface EmissionsMintConfig {
  /** Emissions schedule parameters (uses defaults if not provided) */
  emissionsParams?: Partial<EmissionsParams>;
  /** Minimum token amount per signal (floor) */
  minTokensPerSignal: bigint;
  /** Maximum token amount per signal (cap) */
  maxTokensPerSignal: bigint;
  /** Token decimals (default: 18) */
  decimals: number;
  /** Base multiplier B(t) scaling factor */
  baseMultiplier: number;
  /** Epoch Pulse policy factor E_epoch (governance-controlled, 0.5-1.5) */
  epochPulseFactor: number;
}

const DEFAULT_CONFIG: EmissionsMintConfig = {
  minTokensPerSignal: 1_000_000_000_000_000_000n, // 1 token minimum
  maxTokensPerSignal: 1_000_000_000_000_000_000_000_000n, // 1M tokens maximum
  decimals: 18,
  baseMultiplier: 8.0, // B(t)=8 from goldpaper examples
  epochPulseFactor: 1.0, // E_epoch=1 (neutral)
};

/**
 * Emissions-based mint data provider.
 * 
 * Calculates token amounts using the canonical emissions schedule and
 * goldpaper mint formula.
 */
export class EmissionsMintDataProvider implements IMintDataProvider {
  private readonly schedule: EmissionsSchedule;
  private readonly config: EmissionsMintConfig;

  constructor(
    private readonly metadataFetcher: ISignalMetadataFetcher,
    private readonly epochTracker: IEpochStateTracker,
    config: Partial<EmissionsMintConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.schedule = buildEmissionsSchedule(this.config.emissionsParams);
  }

  /**
   * Get the beneficiary address for a signal.
   */
  async getBeneficiary(signalId: string): Promise<string> {
    const metadata = await this.metadataFetcher.getMetadata(signalId);
    if (!metadata) {
      throw new Error(`Signal metadata not found: ${signalId}`);
    }
    return metadata.beneficiary;
  }

  /**
   * Calculate token amount for a signal using the goldpaper formula.
   * 
   * Formula: ΔAFIᵢ = clamp(B(t) × Qᵢ × Nᵢ × R_val,i × E_epoch, min, max)
   * 
   * Where:
   * - B(t) = base multiplier (decays conceptually but we use epoch budget)
   * - Qᵢ = quality score (from decay score, 0-1)
   * - Nᵢ = novelty factor (1.0 = baseline, higher for novel signals)
   * - R_val,i = validator reputation weight (1.0 = baseline)
   * - E_epoch = Epoch Pulse policy factor (governance-controlled)
   */
  async calculateTokenAmount(signal: SignalValidatorState): Promise<bigint> {
    const metadata = await this.metadataFetcher.getMetadata(signal.signalId);
    if (!metadata) {
      throw new Error(`Signal metadata not found: ${signal.signalId}`);
    }

    // Get epoch emissions budget
    const epochBudget = getEpochEmission(this.schedule, metadata.epoch);
    if (epochBudget <= 0) {
      return 0n; // Past end of schedule or invalid epoch
    }

    // Get epoch state for proportional distribution
    const totalWeight = await this.epochTracker.getEpochTotalWeight(metadata.epoch);
    const alreadyMinted = await this.epochTracker.getEpochMintedAmount(metadata.epoch);
    const remainingBudget = Math.max(0, epochBudget - alreadyMinted);

    if (remainingBudget <= 0 || totalWeight <= 0) {
      return this.config.minTokensPerSignal; // Minimum floor
    }

    // Calculate signal weight
    const Q = metadata.qualityScore; // 0-1
    const N = metadata.noveltyFactor; // typically 1.0, higher for novel
    const R = metadata.reputationWeight; // typically 1.0
    const signalWeight = Q * N * R;

    // Calculate base amount using proportional share of epoch budget
    // This replaces the B(t) multiplier with actual budget-based allocation
    const proportionalShare = signalWeight / totalWeight;
    const baseAmount = remainingBudget * proportionalShare;

    // Apply epoch pulse factor
    const adjustedAmount = baseAmount * this.config.epochPulseFactor;

    // Convert to wei (bigint with decimals)
    const amountWei = BigInt(Math.floor(adjustedAmount * 10 ** this.config.decimals));

    // Clamp to min/max
    return this.clampAmount(amountWei);
  }

  /**
   * Get the epoch number for a signal.
   */
  async getEpoch(signalId: string): Promise<bigint> {
    const metadata = await this.metadataFetcher.getMetadata(signalId);
    if (!metadata) {
      // Fall back to current epoch if metadata not found
      const currentEpoch = await this.epochTracker.getCurrentEpoch();
      return BigInt(currentEpoch);
    }
    return BigInt(metadata.epoch);
  }

  /**
   * Get the receipt ID for a signal.
   */
  async getReceiptId(signalId: string): Promise<bigint> {
    const metadata = await this.metadataFetcher.getMetadata(signalId);
    if (!metadata) {
      throw new Error(`Signal metadata not found: ${signalId}`);
    }
    return metadata.receiptId;
  }

  /**
   * Clamp amount to configured min/max bounds.
   */
  private clampAmount(amount: bigint): bigint {
    if (amount < this.config.minTokensPerSignal) {
      return this.config.minTokensPerSignal;
    }
    if (amount > this.config.maxTokensPerSignal) {
      return this.config.maxTokensPerSignal;
    }
    return amount;
  }

  /**
   * Get the emissions schedule (for inspection/debugging).
   */
  getSchedule(): EmissionsSchedule {
    return this.schedule;
  }

  /**
   * Get emissions budget for a specific epoch.
   */
  getEpochBudget(epoch: number): number {
    return getEpochEmission(this.schedule, epoch);
  }
}

/**
 * Simple in-memory epoch state tracker for testing.
 */
export class InMemoryEpochStateTracker implements IEpochStateTracker {
  private currentEpoch = 1;
  private readonly epochWeights = new Map<number, number>();
  private readonly epochMinted = new Map<number, number>();

  setCurrentEpoch(epoch: number): void {
    this.currentEpoch = epoch;
  }

  addSignalWeight(epoch: number, weight: number): void {
    const current = this.epochWeights.get(epoch) ?? 0;
    this.epochWeights.set(epoch, current + weight);
  }

  recordMint(epoch: number, amount: number): void {
    const current = this.epochMinted.get(epoch) ?? 0;
    this.epochMinted.set(epoch, current + amount);
  }

  async getCurrentEpoch(): Promise<number> {
    return this.currentEpoch;
  }

  async getEpochTotalWeight(epoch: number): Promise<number> {
    return this.epochWeights.get(epoch) ?? 0;
  }

  async getEpochMintedAmount(epoch: number): Promise<number> {
    return this.epochMinted.get(epoch) ?? 0;
  }
}
