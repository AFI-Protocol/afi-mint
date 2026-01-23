/**
 * Challenge Record Schema
 * 
 * Zod schema for challenge window records in the validator pipeline.
 */
import { z } from 'zod';

/**
 * Vote result schema.
 */
export const VoteResultSchema = z.object({
  for: z.number().min(0).describe('Votes in favor of minting'),
  against: z.number().min(0).describe('Votes against minting'),
  abstain: z.number().min(0).optional().describe('Abstention votes'),
  quorum: z.number().min(0).optional().describe('Total voting power that participated')
});

/**
 * Challenge record schema.
 */
export const ChallengeRecordSchema = z.object({
  signalId: z.string().describe('Unique signal identifier'),
  snapshotProposalId: z.string().describe('Snapshot proposal ID'),
  challengeOpenedAt: z.string().datetime().describe('ISO timestamp when challenge window opened'),
  challengeClosedAt: z.string().datetime().optional().describe('ISO timestamp when challenge window closed'),
  challengeWindowDurationHours: z.number().positive().describe('Duration of challenge window in hours'),
  voteResult: VoteResultSchema.optional().describe('Final vote results'),
  outcome: z.enum(['pending', 'approved', 'rejected']).describe('Challenge outcome'),
  decayScoreAtOpen: z.number().min(0).max(1).describe('Decay score when challenge opened'),
  createdAt: z.string().datetime().describe('ISO timestamp when record was created'),
  updatedAt: z.string().datetime().describe('ISO timestamp of last update')
});

export type VoteResult = z.infer<typeof VoteResultSchema>;
export type ChallengeRecord = z.infer<typeof ChallengeRecordSchema>;
