/**
 * Reputation Bridge: connects PoI / PoInsight / Repₜ state to the mint/emissions layer.
 *
 * Design references:
 * - afi-config/docs/REGISTRIES_AND_REPUTATION.v0.1.md (canonical invariants)
 * - afi-mint/README.md (mint/emissions overview)
 *
 * This module does NOT modify vault finality or the Universal Weighting Rule (UWR).
 * It only shapes reputation state into emission weights and provides projection
 * hooks for governance-approved algorithms. All logic here is placeholder and must
 * be replaced with audited, deterministic implementations.
 */

/**
 * Minimal validator decision view aligned with afi-core/validators/ValidatorDecision.ts.
 * TODO: Replace with a direct import once cross-repo build wiring is established.
 */
export interface ValidatorDecision {
  signalId: string;
  validatorId: string;
  decision: "approve" | "reject" | "flag" | "abstain";
  uwrConfidence: number;
  regimeTag?: string;
  novelty?: unknown;
  reasonCodes?: string[];
  notes?: string;
  createdAt: string;
}

/**
 * Minimal T.S.S.D. score snapshot view (see afi-infra/src/tssd/types.ts).
 * TODO: Replace with shared type import when available.
 */
export interface TssdScoreSnapshotLike {
  baseScore: number;
  confidence: number;
  poiLevel?: string;
  poInsightLevel?: string;
}

/**
 * Reputation state for an agent at the time of an emissions calculation.
 *
 * Values should originate from the canonical registry / T.S.S.D. / reputation
 * store, not from this module directly.
 */
export interface ReputationSnapshotInput {
  agentId: string;
  role: string;
  poiScore: number;
  poInsightScore: number;
  repTScore?: number;
  stakeWeight?: number;
  poiLevel?: string;
  poInsightLevel?: string;
  latestScoreSnapshot?: TssdScoreSnapshotLike;
}

/**
 * Per-agent emission weight for a mint/emissions event.
 */
export interface EmissionWeight {
  agentId: string;
  weight: number;
  reasons?: string[];
}

/**
 * Configuration for reputation-driven emission weighting.
 *
 * Thresholds and multipliers are placeholders and should be replaced with
 * governance-approved values.
 */
export interface ReputationBridgeConfig {
  minPoiThreshold?: number;
  minPoInsightThreshold?: number;
  minRepTThreshold?: number;
  analystWeightMultiplier?: number;
  validatorWeightMultiplier?: number;
  stakeWeightMultiplier?: number;
  decayFactor?: number;
}

/**
 * Compute emission weights for a batch of agents based on reputation inputs.
 *
 * This is the conceptual bridge from PoI/PoInsight/Repₜ into mint/emissions
 * weighting. Real logic must respect the invariants in
 * REGISTRIES_AND_REPUTATION.v0.1.md and remain auditable.
 */
export function computeEmissionWeights(
  snapshots: ReputationSnapshotInput[],
  config?: ReputationBridgeConfig
): EmissionWeight[] {
  // TODO: implement reputation-weighted emission logic using governance-approved math.
  void snapshots;
  void config;
  return [];
}

/**
 * Project an updated reputation snapshot from a validator decision.
 *
 * This should eventually update PoI / PoInsight / Repₜ in line with the
 * reputation invariants, without altering UWR or vault finality.
 */
export function projectReputationFromDecision(
  current: ReputationSnapshotInput,
  decision: ValidatorDecision
): ReputationSnapshotInput {
  // TODO: implement reputation update projection based on a single ValidatorDecision.
  void decision;
  return current;
}
