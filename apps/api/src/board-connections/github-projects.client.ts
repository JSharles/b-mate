import { Injectable } from '@nestjs/common';

// GitHub Projects v2 has no REST equivalent — it's GraphQL-only. See
// specs/005-github-project-connection research.md Decision 1.
const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

export type GithubOwnerType = 'User' | 'Organization';

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

export interface CurrentTaskItem {
  title: string;
  description: string | null;
  url: string | null;
}

type GithubItemContentType = 'Issue' | 'PullRequest' | 'DraftIssue';

interface GithubItemContent {
  __typename: GithubItemContentType;
  title: string;
  body?: string;
  url?: string;
}

interface GithubItemNode {
  content: GithubItemContent | null;
  fieldValueByName: { name: string } | null;
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
function itemsQuery(ownerType: GithubOwnerType): string {
  const rootField = ownerType === 'User' ? 'user' : 'organization';

  return `
    query($login: String!, $number: Int!) {
      ${rootField}(login: $login) {
        projectV2(number: $number) {
          items(first: 100) {
            nodes {
              content {
                __typename
                ... on Issue { title body url }
                ... on PullRequest { title body url }
                ... on DraftIssue { title body }
              }
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue { name }
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
  ): Promise<CurrentTaskItem[]> {
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

    const items: CurrentTaskItem[] = [];
    for (const node of nodes) {
      const status = node.fieldValueByName?.name;
      if (!status || !status.toLowerCase().includes('in progress')) continue;
      if (!node.content) continue;

      items.push({
        title: node.content.title,
        description: node.content.body ?? null,
        url: node.content.url ?? null,
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
