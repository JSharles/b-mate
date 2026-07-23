import { GithubProjectsClient } from './github-projects.client';

function mockFetchOnce(response: {
  ok: boolean;
  status?: number;
  json: () => unknown;
}) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? 200,
    json: () => Promise.resolve(response.json()),
  });
}

const boardNode = {
  number: 3,
  title: 'Roadmap',
  url: 'https://github.com/orgs/acme/projects/3',
  owner: { __typename: 'Organization', login: 'acme' },
};

describe('GithubProjectsClient', () => {
  let client: GithubProjectsClient;

  beforeEach(() => {
    client = new GithubProjectsClient();
  });

  describe('listAccessibleBoards', () => {
    it('maps the GraphQL response to a flat list of boards', async () => {
      mockFetchOnce({
        ok: true,
        json: () => ({
          data: { viewer: { projectsV2: { nodes: [boardNode] } } },
        }),
      });

      const result = await client.listAccessibleBoards('a-token');

      expect(result).toEqual([
        {
          ownerLogin: 'acme',
          ownerType: 'Organization',
          number: 3,
          title: 'Roadmap',
          url: 'https://github.com/orgs/acme/projects/3',
        },
      ]);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/graphql',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer a-token',
          }) as unknown,
        }),
      );
    });

    it('returns an empty list when the token has no accessible boards', async () => {
      mockFetchOnce({
        ok: true,
        json: () => ({ data: { viewer: { projectsV2: { nodes: [] } } } }),
      });

      const result = await client.listAccessibleBoards('a-token');

      expect(result).toEqual([]);
    });

    it('throws without leaking the token when the request fails', async () => {
      mockFetchOnce({ ok: false, status: 401, json: () => ({}) });

      await expect(
        client.listAccessibleBoards('super-secret-token'),
      ).rejects.toThrow('GitHub API request failed with status 401');
    });

    it('throws when GitHub returns GraphQL errors', async () => {
      mockFetchOnce({
        ok: true,
        json: () => ({ errors: [{ message: 'Bad credentials' }] }),
      });

      await expect(client.listAccessibleBoards('a-token')).rejects.toThrow(
        'GitHub API returned an error',
      );
    });

    it('throws when the response has no data', async () => {
      mockFetchOnce({ ok: true, json: () => ({}) });

      await expect(client.listAccessibleBoards('a-token')).rejects.toThrow(
        'GitHub API returned no data',
      );
    });
  });

  describe('verifyBoardAccess', () => {
    it('returns the matching board when it is in the accessible list', async () => {
      mockFetchOnce({
        ok: true,
        json: () => ({
          data: { viewer: { projectsV2: { nodes: [boardNode] } } },
        }),
      });

      const result = await client.verifyBoardAccess(
        'a-token',
        'acme',
        'Organization',
        3,
      );

      expect(result).toEqual({
        ownerLogin: 'acme',
        ownerType: 'Organization',
        number: 3,
        title: 'Roadmap',
        url: 'https://github.com/orgs/acme/projects/3',
      });
    });

    it('returns null when the board is not in the accessible list', async () => {
      mockFetchOnce({
        ok: true,
        json: () => ({
          data: { viewer: { projectsV2: { nodes: [boardNode] } } },
        }),
      });

      const result = await client.verifyBoardAccess(
        'a-token',
        'someone-else',
        'User',
        99,
      );

      expect(result).toBeNull();
    });
  });

  describe('fetchInProgressItems', () => {
    const inProgressIssue = {
      content: {
        __typename: 'Issue',
        title: 'Fix race condition',
        body: 'Details about the race condition',
        url: 'https://github.com/acme/repo/issues/1',
      },
      fieldValueByName: { name: 'In Progress' },
    };

    it('includes an item whose Status value contains "in progress" (case-insensitive)', async () => {
      mockFetchOnce({
        ok: true,
        json: () => ({
          data: {
            organization: {
              projectV2: { items: { nodes: [inProgressIssue] } },
            },
          },
        }),
      });

      const result = await client.fetchInProgressItems(
        'a-token',
        'acme',
        'Organization',
        3,
      );

      expect(result).toEqual([
        {
          title: 'Fix race condition',
          description: 'Details about the race condition',
          url: 'https://github.com/acme/repo/issues/1',
        },
      ]);
    });

    it('queries the "user" root field for a User-owned board', async () => {
      mockFetchOnce({
        ok: true,
        json: () => ({
          data: { user: { projectV2: { items: { nodes: [] } } } },
        }),
      });

      await client.fetchInProgressItems('a-token', 'jc', 'User', 3);

      const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [
        string,
        RequestInit,
      ];
      const body = JSON.parse(init.body as string) as { query: string };
      expect(body.query).toContain('user(login: $login)');
    });

    it('excludes an item whose Status value does not contain "in progress"', async () => {
      mockFetchOnce({
        ok: true,
        json: () => ({
          data: {
            organization: {
              projectV2: {
                items: {
                  nodes: [
                    {
                      ...inProgressIssue,
                      fieldValueByName: { name: 'Done' },
                    },
                  ],
                },
              },
            },
          },
        }),
      });

      const result = await client.fetchInProgressItems(
        'a-token',
        'acme',
        'Organization',
        3,
      );

      expect(result).toEqual([]);
    });

    it('excludes an item with no Status field value at all', async () => {
      mockFetchOnce({
        ok: true,
        json: () => ({
          data: {
            organization: {
              projectV2: {
                items: {
                  nodes: [{ ...inProgressIssue, fieldValueByName: null }],
                },
              },
            },
          },
        }),
      });

      const result = await client.fetchInProgressItems(
        'a-token',
        'acme',
        'Organization',
        3,
      );

      expect(result).toEqual([]);
    });

    it('includes a DraftIssue match with a null url', async () => {
      mockFetchOnce({
        ok: true,
        json: () => ({
          data: {
            organization: {
              projectV2: {
                items: {
                  nodes: [
                    {
                      content: {
                        __typename: 'DraftIssue',
                        title: 'Draft: sketch the new flow',
                        body: 'Some notes',
                      },
                      fieldValueByName: { name: 'In Progress' },
                    },
                  ],
                },
              },
            },
          },
        }),
      });

      const result = await client.fetchInProgressItems(
        'a-token',
        'acme',
        'Organization',
        3,
      );

      expect(result).toEqual([
        {
          title: 'Draft: sketch the new flow',
          description: 'Some notes',
          url: null,
        },
      ]);
    });

    it('skips an item whose content is null (e.g. a redacted item)', async () => {
      mockFetchOnce({
        ok: true,
        json: () => ({
          data: {
            organization: {
              projectV2: {
                items: {
                  nodes: [
                    {
                      content: null,
                      fieldValueByName: { name: 'In Progress' },
                    },
                  ],
                },
              },
            },
          },
        }),
      });

      const result = await client.fetchInProgressItems(
        'a-token',
        'acme',
        'Organization',
        3,
      );

      expect(result).toEqual([]);
    });

    it('returns an empty list when the board has no items', async () => {
      mockFetchOnce({
        ok: true,
        json: () => ({
          data: { organization: { projectV2: { items: { nodes: [] } } } },
        }),
      });

      const result = await client.fetchInProgressItems(
        'a-token',
        'acme',
        'Organization',
        3,
      );

      expect(result).toEqual([]);
    });
  });
});
