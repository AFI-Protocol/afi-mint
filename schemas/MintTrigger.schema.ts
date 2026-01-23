/**
 * Mint Trigger Schema
 * 
 * Zod schema for mint trigger events in the validator pipeline.
 */
import { z } from 'zod';

/**
 * Mint request schema (matches on-chain MintRequest struct).
 */
export const MintRequestSchema = z.object({
  beneficiary: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe('Ethereum address receiving tokens'),
  tokenAmount: z.string().describe('Token amount as string (for BigInt compatibility)'),
  receiptId: z.string().describe('ERC-1155 receipt ID as string'),
  receiptAmount: z.string().describe('Receipt amount as string'),
  signalId: z.string().describe('Signal ID (bytes32 on-chain)'),
  epoch: z.string().describe('Epoch ID as string'),
  extraData: z.string().optional().describe('Additional encoded data')
});

/**
 * Mint trigger schema.
 */
export const MintTriggerSchema = z.object({
  signalId: z.string().describe('Unique signal identifier'),
  triggerType: z.enum(['automatic', 'manual', 'retry']).describe('How mint was triggered'),
  baseScore: z.number().min(0).max(1).describe('Original UWR score'),
  decayScore: z.number().min(0).max(1).describe('Time-decayed UWR score'),
  ageHours: z.number().min(0).describe('Signal age in hours'),
  halfLifeHours: z.number().positive().describe('Half-life used for decay'),
  approvalPercentage: z.number().min(0).max(1).describe('Vote approval percentage'),
  quorumMet: z.boolean().describe('Whether quorum was achieved'),
  snapshotProposalId: z.string().describe('Snapshot proposal ID'),
  mintRequest: MintRequestSchema.describe('On-chain mint request parameters'),
  txHash: z.string().optional().describe('Transaction hash if minted'),
  status: z.enum(['pending', 'submitted', 'confirmed', 'failed']).describe('Mint status'),
  failureReason: z.string().optional().describe('Reason for failure if applicable'),
  triggeredAt: z.string().datetime().describe('ISO timestamp when mint was triggered'),
  confirmedAt: z.string().datetime().optional().describe('ISO timestamp when mint was confirmed'),
  gasUsed: z.string().optional().describe('Gas used for transaction')
});

export type MintRequest = z.infer<typeof MintRequestSchema>;
export type MintTrigger = z.infer<typeof MintTriggerSchema>;
