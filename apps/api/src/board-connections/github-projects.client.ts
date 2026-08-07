import { Injectable } from '@nestjs/common';

// GitHub Projects v2 has no REST equivalent — it's GraphQL-only. See
// specs/005-github-project-connection research.md Decision 1.
const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

export type GithubOwnerType = 'User' | 'Organization';

// Thrown specifically for a 401/403 GitHub response — see query() below.
export class GithubAuthError extends Error {}

export interface AvailableBoard {
  ownerLogin: string;
  ownerType: GithubOwnerType;
  number: number;
  title: string;
  url: string;
}

interface GithubProjectsV2Node {
  number: number;
  title: string;
  url: string;
  owner: { __typename: GithubOwnerType; login: string };
}

interface ListBoardsResponse {
  viewer: { projectsV2: { nodes: GithubProjectsV2Node[] } };
}

// The ProjectV2Item's own node id — its identity as "this content's
// placement on this specific board" (specs/007-current-task-vulgarization
// research.md Decision 3), used by task-vulgarization to key persisted rows.
// Not part of the public CurrentTaskItemSchema (packages/schemas) — that
// shape has no `id`, since the frontend never needs one. No `url` either —
// the client is never sent to GitHub (specs/006 feedback), so this feature
// doesn't carry it any further than this fetch.
//
// boardStartDate/boardTargetDate/boardEstimateValue (specs/008
// data-model.md): the board's own custom fields, when present and validly
// typed — null otherwise (field absent, empty, or the wrong field type).
export interface InProgressItem {
  id: string;
  title: string;
  description: string | null;
  boardStartDate: string | null;
  boardTargetDate: string | null;
  boardEstimateValue: number | null;
}

type GithubItemContentType = 'Issue' | 'PullRequest' | 'DraftIssue';

interface GithubItemContent {
  __typename: GithubItemContentType;
  title: string;
  body?: string;
}

interface GithubItemNode {
  id: string;
  content: GithubItemContent | null;
  status: { name: string } | null;
  startDate: { date: string } | null;
  targetDate: { date: string } | null;
  estimate: { number: number } | null;
}

interface FetchItemsResponse {
  user?: { projectV2: { items: { nodes: GithubItemNode[] } } | null } | null;
  organization?: {
    projectV2: { items: { nodes: GithubItemNode[] } } | null;
  } | null;
}

// `viewer` resolves to whichever identity the token belongs to — this
// returns exactly the boards the developer needs to pick from (research.md
// Decision 2), and doubles as the access check for a specific board
// (Decision 3): a board that doesn't appear here is not accessible.
const LIST_BOARDS_QUERY = `
  query {
    viewer {
      projectsV2(first: 50) {
        nodes {
          number
          title
          url
          owner {
            __typename
            ... on User { login }
            ... on Organization { login }
          }
        }
      }
    }
  }
`;

// GitHub's Status single-select field, looked up by its exact default name —
// a board that renamed/removed it simply yields no matches (research.md
// Decision 1). GraphQL has no dynamic root field, so `user`/`organization`
// is chosen by string-building the query, not by a variable.
//
// startDate/targetDate/estimate (specs/008-current-task-progress
// data-model.md): the same board-item custom fields the user's own GitHub
// Projects v2 board template already provides, looked up by exact name the
// same way Status is — aliased since fieldValueByName can't be called more
// than once per node without one. A field of the wrong underlying type (or
// absent entirely) simply doesn't match its fragment, yielding null with no
// extra handling needed.
function itemsQuery(ownerType: GithubOwnerType): string {
  const rootField = ownerType === 'User' ? 'user' : 'organization';

  return `
    query($login: String!, $number: Int!) {
      ${rootField}(login: $login) {
        projectV2(number: $number) {
          items(first: 100) {
            nodes {
              id
              content {
                __typename
                ... on Issue { title body }
                ... on PullRequest { title body }
                ... on DraftIssue { title body }
              }
              status: fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue { name }
              }
              startDate: fieldValueByName(name: "Start date") {
                ... on ProjectV2ItemFieldDateValue { date }
              }
              targetDate: fieldValueByName(name: "Target date") {
                ... on ProjectV2ItemFieldDateValue { date }
              }
              estimate: fieldValueByName(name: "Estimate") {
                ... on ProjectV2ItemFieldNumberValue { number }
              }
            }
          }
        }
      }
    }
  `;
}

@Injectable()
export class GithubProjectsClient {
  async listAccessibleBoards(token: string): Promise<AvailableBoard[]> {
    const data = await this.query<ListBoardsResponse>(token, LIST_BOARDS_QUERY);

    return data.viewer.projectsV2.nodes.map((node) => ({
      ownerLogin: node.owner.login,
      ownerType: node.owner.__typename,
      number: node.number,
      title: node.title,
      url: node.url,
    }));
  }

  async verifyBoardAccess(
    token: string,
    ownerLogin: string,
    ownerType: GithubOwnerType,
    number: number,
  ): Promise<AvailableBoard | null> {
    const boards = await this.listAccessibleBoards(token);

    return (
      boards.find(
        (board) =>
          board.ownerLogin === ownerLogin &&
          board.ownerType === ownerType &&
          board.number === number,
      ) ?? null
    );
  }

  // Matches items whose Status value (case-insensitive substring) contains
  // "in progress" — the field name itself is matched exactly ("Status"),
  // per the product decision (spec.md, research.md Decisions 1-2). Content
  // with no matching fragment (e.g. a redacted item) is skipped rather than
  // erroring (research.md Decision 3).
  async fetchInProgressItems(
    token: string,
    ownerLogin: string,
    ownerType: GithubOwnerType,
    number: number,
  ): Promise<InProgressItem[]> {
    const data = await this.query<FetchItemsResponse>(
      token,
      itemsQuery(ownerType),
      {
        login: ownerLogin,
        number,
      },
    );

    const owner = ownerType === 'User' ? data.user : data.organization;
    const nodes = owner?.projectV2?.items.nodes ?? [];

    const items: InProgressItem[] = [];
    for (const node of nodes) {
      const status = node.status?.name;
      if (!status || !status.toLowerCase().includes('in progress')) continue;
      if (!node.content) continue;

      items.push({
        id: node.id,
        title: node.content.title,
        description: node.content.body ?? null,
        boardStartDate: node.startDate?.date ?? null,
        boardTargetDate: node.targetDate?.date ?? null,
        boardEstimateValue: node.estimate?.number ?? null,
      });
    }

    return items;
  }

  private async query<T>(
    token: string,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(GITHUB_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    // Never surface the raw GitHub response (or the token) in a thrown error.
    // 401/403 specifically means the stored token was revoked or is
    // otherwise invalid — distinguished from other failures (5xx, network)
    // so the background sweep can tell "needs reconnecting" apart from
    // "transient, will retry" (specs/010-github-oauth-board-connection,
    // FR-008, research.md Decision 6).
    if (res.status === 401 || res.status === 403) {
      throw new GithubAuthError(
        `GitHub API request failed with status ${res.status}`,
      );
    }
    if (!res.ok) {
      throw new Error(`GitHub API request failed with status ${res.status}`);
    }

    const body = (await res.json()) as {
      data?: T;
      errors?: Array<{ message: string }>;
    };

    if (body.errors && body.errors.length > 0) {
      throw new Error('GitHub API returned an error');
    }
    if (!body.data) {
      throw new Error('GitHub API returned no data');
    }

    return body.data;
  }
}
