/**
 * Snapshot Client
 * 
 * API wrapper for Snapshot.org governance voting.
 * Supports creating proposals, reading vote results, and checking proposal status.
 */

/**
 * Snapshot proposal type.
 */
export type SnapshotProposalType = 'single-choice' | 'approval' | 'quadratic' | 'ranked-choice' | 'weighted' | 'basic';

/**
 * Snapshot proposal state.
 */
export type SnapshotProposalState = 'pending' | 'active' | 'closed';

/**
 * Snapshot proposal data.
 */
export interface SnapshotProposal {
  id: string;
  title: string;
  body: string;
  choices: string[];
  start: number;
  end: number;
  snapshot: string;
  state: SnapshotProposalState;
  author: string;
  space: {
    id: string;
    name: string;
  };
  scores: number[];
  scores_total: number;
  votes: number;
}

/**
 * Snapshot vote data.
 */
export interface SnapshotVote {
  id: string;
  voter: string;
  created: number;
  choice: number | number[] | Record<string, number>;
  vp: number; // Voting power
}

/**
 * Create proposal parameters.
 */
export interface CreateProposalParams {
  space: string;
  title: string;
  body: string;
  choices: string[];
  start: number;
  end: number;
  snapshot: string;
  type: SnapshotProposalType;
  metadata?: Record<string, unknown>;
}

/**
 * Snapshot client configuration.
 */
export interface SnapshotClientConfig {
  hubUrl: string;
  sequencerUrl: string;
}

/**
 * Default Snapshot configuration (mainnet).
 */
export const DEFAULT_SNAPSHOT_CONFIG: SnapshotClientConfig = {
  hubUrl: 'https://hub.snapshot.org',
  sequencerUrl: 'https://seq.snapshot.org'
};

interface SnapshotGraphQLResponseBody<T> {
  data?: T;
  errors?: ReadonlyArray<Record<string, unknown>>;
}

interface SnapshotSequencerResponseBody {
  id?: string;
  error?: string;
  error_description?: string;
}

/**
 * Snapshot GraphQL query for proposals.
 */
const PROPOSAL_QUERY = `
  query Proposal($id: String!) {
    proposal(id: $id) {
      id
      title
      body
      choices
      start
      end
      snapshot
      state
      author
      space {
        id
        name
      }
      scores
      scores_total
      votes
    }
  }
`;

/**
 * Snapshot GraphQL query for votes on a proposal.
 */
const VOTES_QUERY = `
  query Votes($proposalId: String!, $first: Int!, $skip: Int!) {
    votes(
      first: $first
      skip: $skip
      where: { proposal: $proposalId }
      orderBy: "created"
      orderDirection: desc
    ) {
      id
      voter
      created
      choice
      vp
    }
  }
`;

/**
 * Snapshot Client
 * 
 * Provides methods for interacting with Snapshot.org:
 * - Create proposals
 * - Get proposal details
 * - Get proposal status
 * - Get vote results
 */
export class SnapshotClient {
  private readonly config: SnapshotClientConfig;

  constructor(config?: Partial<SnapshotClientConfig>) {
    this.config = { ...DEFAULT_SNAPSHOT_CONFIG, ...config };
  }

  /**
   * Execute a GraphQL query against Snapshot hub.
   */
  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.config.hubUrl}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    });

    if (!response.ok) {
      throw new Error(`Snapshot API error: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as SnapshotGraphQLResponseBody<T>;
    if (json.errors) {
      throw new Error(`Snapshot GraphQL error: ${JSON.stringify(json.errors)}`);
    }

    return json.data as T;
  }

  /**
   * Get a proposal by ID.
   */
  async getProposal(proposalId: string): Promise<SnapshotProposal | null> {
    const data = await this.graphql<{ proposal: SnapshotProposal | null }>(
      PROPOSAL_QUERY,
      { id: proposalId }
    );
    return data.proposal;
  }

  /**
   * Get the status of a proposal.
   */
  async getProposalStatus(proposalId: string): Promise<SnapshotProposalState | null> {
    const proposal = await this.getProposal(proposalId);
    return proposal?.state ?? null;
  }

  /**
   * Get votes for a proposal.
   */
  async getVotes(proposalId: string, first = 1000, skip = 0): Promise<SnapshotVote[]> {
    const data = await this.graphql<{ votes: SnapshotVote[] }>(
      VOTES_QUERY,
      { proposalId, first, skip }
    );
    return data.votes;
  }

  /**
   * Get all votes for a proposal (paginated).
   */
  async getAllVotes(proposalId: string): Promise<SnapshotVote[]> {
    const allVotes: SnapshotVote[] = [];
    let skip = 0;
    const pageSize = 1000;

    while (true) {
      const votes = await this.getVotes(proposalId, pageSize, skip);
      allVotes.push(...votes);

      if (votes.length < pageSize) {
        break;
      }
      skip += pageSize;
    }

    return allVotes;
  }

  /**
   * Get vote results summary.
   */
  async getVoteResults(proposalId: string): Promise<{
    for: number;
    against: number;
    abstain: number;
    total: number;
    quorum: number;
  } | null> {
    const proposal = await this.getProposal(proposalId);
    if (!proposal) return null;

    // Standard AFI proposal format: ["For", "Against", "Abstain"]
    const scores = proposal.scores ?? [0, 0, 0];
    
    return {
      for: scores[0] ?? 0,
      against: scores[1] ?? 0,
      abstain: scores[2] ?? 0,
      total: proposal.scores_total ?? 0,
      quorum: proposal.votes ?? 0
    };
  }

  /**
   * Create a proposal.
   * Note: Requires authentication via wallet signature.
   */
  async createProposal(
    params: CreateProposalParams,
    signMessage: (message: string) => Promise<string>,
    address: string
  ): Promise<string> {
    const message = {
      space: params.space,
      type: params.type,
      title: params.title,
      body: params.body,
      choices: params.choices,
      start: params.start,
      end: params.end,
      snapshot: params.snapshot,
      plugins: JSON.stringify({}),
      app: 'afi-protocol',
      metadata: JSON.stringify(params.metadata ?? {})
    };

    const envelope = {
      address,
      msg: JSON.stringify({
        version: '0.1.4',
        timestamp: Math.floor(Date.now() / 1000).toString(),
        space: params.space,
        type: 'proposal',
        payload: message
      }),
      sig: ''
    };

    envelope.sig = await signMessage(envelope.msg);

    const response = await fetch(`${this.config.sequencerUrl}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope)
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to create proposal: ${response.status} - ${text}`);
    }

    const result = (await response.json()) as SnapshotSequencerResponseBody;
    if (result.error) {
      throw new Error(`Snapshot error: ${result.error_description || result.error}`);
    }

    return result.id as string;
  }

  /**
   * Check if a proposal exists for a given signal.
   * Useful for preventing duplicate proposals.
   */
  async proposalExistsForSignal(spaceId: string, signalId: string): Promise<string | null> {
    const query = `
      query ProposalsForSignal($space: String!, $signalId: String!) {
        proposals(
          first: 1
          where: {
            space: $space
            body_contains: $signalId
          }
        ) {
          id
        }
      }
    `;

    const data = await this.graphql<{ proposals: Array<{ id: string }> }>(
      query,
      { space: spaceId, signalId }
    );

    return data.proposals[0]?.id ?? null;
  }

  /**
   * Get the current block number for snapshot.
   */
  async getCurrentBlockNumber(): Promise<string> {
    // In production, this would query the blockchain
    // For now, return a placeholder that should be replaced
    return 'latest';
  }
}
