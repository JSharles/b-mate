import {
  GithubAuthError,
  GithubProjectsClient,
} from './github-projects.client';

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

    it('throws a GithubAuthError without leaking the token on a 401', async () => {
      mockFetchOnce({ ok: false, status: 401, json: () => ({}) });

      await expect(
        client.listAccessibleBoards('super-secret-token'),
      ).rejects.toThrow('GitHub API request failed with status 401');
      await expect(
        client.listAccessibleBoards('super-secret-token'),
      ).rejects.toBeInstanceOf(GithubAuthError);
    });

    it('throws a GithubAuthError on a 403', async () => {
      mockFetchOnce({ ok: false, status: 403, json: () => ({}) });

      await expect(
        client.listAccessibleBoards('a-token'),
      ).rejects.toBeInstanceOf(GithubAuthError);
    });

    it('throws a plain Error, not a GithubAuthError, on a non-auth failure', async () => {
      mockFetchOnce({ ok: false, status: 500, json: () => ({}) });

      const error = await client
        .listAccessibleBoards('a-token')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(GithubAuthError);
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
      id: 'PVTI_item1',
      content: {
        __typename: 'Issue',
        title: 'Fix race condition',
        body: 'Details about the race condition',
        url: 'https://github.com/acme/repo/issues/1',
      },
      status: { name: 'In Progress' },
      startDate: null,
      targetDate: null,
      estimate: null,
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
          id: 'PVTI_item1',
          title: 'Fix race condition',
          description: 'Details about the race condition',
          boardStartDate: null,
          boardTargetDate: null,
          boardEstimateValue: null,
        },
      ]);
    });

    it('includes Start date/Target date/Estimate values when the board provides them', async () => {
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
                      startDate: { date: '2026-07-25' },
                      targetDate: { date: '2026-07-27' },
                      estimate: { number: 4 },
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
          id: 'PVTI_item1',
          title: 'Fix race condition',
          description: 'Details about the race condition',
          boardStartDate: '2026-07-25',
          boardTargetDate: '2026-07-27',
          boardEstimateValue: 4,
        },
      ]);
    });

    it('maps a field present but of the wrong underlying type to null rather than throwing', async () => {
      // A text field named "Estimate" (not a Number field) doesn't match
      // the ProjectV2ItemFieldNumberValue fragment — GitHub's GraphQL
      // response yields null for that selection, same as a field that
      // doesn't exist on the board at all.
      mockFetchOnce({
        ok: true,
        json: () => ({
          data: {
            organization: {
              projectV2: {
                items: { nodes: [{ ...inProgressIssue, estimate: null }] },
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

      expect(result[0].boardEstimateValue).toBeNull();
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
                      status: { name: 'Done' },
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
                  nodes: [{ ...inProgressIssue, status: null }],
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

    it('includes a DraftIssue match', async () => {
      mockFetchOnce({
        ok: true,
        json: () => ({
          data: {
            organization: {
              projectV2: {
                items: {
                  nodes: [
                    {
                      id: 'PVTI_draft1',
                      content: {
                        __typename: 'DraftIssue',
                        title: 'Draft: sketch the new flow',
                        body: 'Some notes',
                      },
                      status: { name: 'In Progress' },
                      startDate: null,
                      targetDate: null,
                      estimate: null,
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
          id: 'PVTI_draft1',
          title: 'Draft: sketch the new flow',
          description: 'Some notes',
          boardStartDate: null,
          boardTargetDate: null,
          boardEstimateValue: null,
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
                      status: { name: 'In Progress' },
                      startDate: null,
                      targetDate: null,
                      estimate: null,
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

  describe('fetchTaskCounts', () => {
    function itemNode(
      status: string | null,
      content: unknown = {
        __typename: 'Issue',
        title: 'Some task',
        body: null,
      },
    ) {
      return {
        content,
        status: status ? { name: status } : null,
        startDate: null,
        targetDate: null,
        estimate: null,
      };
    }

    it('counts items whose Status contains "done" (case-insensitive) as done, out of every triaged item', async () => {
      mockFetchOnce({
        ok: true,
        json: () => ({
          data: {
            organization: {
              projectV2: {
                items: {
                  nodes: [
                    itemNode('Todo'),
                    itemNode('In Progress'),
                    itemNode('Done'),
                    itemNode('DONE'),
                  ],
                },
              },
            },
          },
        }),
      });

      const result = await client.fetchTaskCounts(
        'a-token',
        'acme',
        'Organization',
        3,
      );

      expect(result).toEqual({ total: 4, done: 2 });
    });

    it('excludes items with no Status value from the total (not yet triaged)', async () => {
      mockFetchOnce({
        ok: true,
        json: () => ({
          data: {
            organization: {
              projectV2: {
                items: { nodes: [itemNode('Todo'), itemNode(null)] },
              },
            },
          },
        }),
      });

      const result = await client.fetchTaskCounts(
        'a-token',
        'acme',
        'Organization',
        3,
      );

      expect(result).toEqual({ total: 1, done: 0 });
    });

    it('excludes an item with no content (e.g. a redacted item) even if it has a Status', async () => {
      mockFetchOnce({
        ok: true,
        json: () => ({
          data: {
            organization: {
              projectV2: { items: { nodes: [itemNode('Done', null)] } },
            },
          },
        }),
      });

      const result = await client.fetchTaskCounts(
        'a-token',
        'acme',
        'Organization',
        3,
      );

      expect(result).toEqual({ total: 0, done: 0 });
    });

    it('returns zero counts when the board has no items', async () => {
      mockFetchOnce({
        ok: true,
        json: () => ({
          data: { organization: { projectV2: { items: { nodes: [] } } } },
        }),
      });

      const result = await client.fetchTaskCounts(
        'a-token',
        'acme',
        'Organization',
        3,
      );

      expect(result).toEqual({ total: 0, done: 0 });
    });
  });
});
