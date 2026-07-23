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

  private async query<T>(token: string, query: string): Promise<T> {
    const res = await fetch(GITHUB_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
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
