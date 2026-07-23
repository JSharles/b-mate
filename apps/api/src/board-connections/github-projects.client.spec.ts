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
});
