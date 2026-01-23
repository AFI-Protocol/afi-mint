/**
 * Signal Validator State Schema
 * 
 * Zod schema for signal validator state records.
 * Tracks signals through the validation pipeline.
 */
import { z } from 'zod';
import { VoteResultSchema } from './ChallengeRecord.schema.js';

/**
 * Signal validator state kinds.
 */
export const SignalValidatorStateKindSchema = z.enum([
  'pending',
  'decay_pass',
  'challenge_open',
  'voting_complete',
  'minted',
  'rejected'
]);

/**
 * Signal validator state schema.
 */
export const SignalValidatorStateSchema = z.object({
  signalId: z.string().describe('Unique signal identifier'),
  state: SignalValidatorStateKindSchema.describe('Current state in validation pipeline'),
  decayScore: z.number().min(0).max(1).optional().describe('Time-decayed UWR score'),
  baseScore: z.number().min(0).max(1).optional().describe('Original base score'),
  ageHours: z.number().min(0).optional().describe('Signal age in hours'),
  halfLifeHours: z.number().positive().optional().describe('Half-life used for decay'),
  decayPassAt: z.string().datetime().optional().describe('When signal passed decay threshold'),
  snapshotProposalId: z.string().optional().describe('Snapshot proposal ID'),
  challengeOpenedAt: z.string().datetime().optional().describe('When challenge window opened'),
  challengeClosedAt: z.string().datetime().optional().describe('When challenge window closed'),
  voteResult: VoteResultSchema.optional().describe('Vote results from Snapshot'),
  mintTxHash: z.string().optional().describe('Transaction hash of mint'),
  rejectionReason: z.string().optional().describe('Reason for rejection'),
  updatedAt: z.string().datetime().describe('Last update timestamp'),
  createdAt: z.string().datetime().describe('Creation timestamp')
});

export type SignalValidatorStateKind = z.infer<typeof SignalValidatorStateKindSchema>;
export type SignalValidatorState = z.infer<typeof SignalValidatorStateSchema>;
