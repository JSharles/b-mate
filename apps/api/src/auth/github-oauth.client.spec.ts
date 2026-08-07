import { GithubOauthClient } from './github-oauth.client';

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('GithubOauthClient', () => {
  let client: GithubOauthClient;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.GITHUB_OAUTH_CLIENT_ID = 'client-id';
    process.env.GITHUB_OAUTH_CLIENT_SECRET = 'client-secret';
    process.env.GITHUB_OAUTH_CALLBACK_URL =
      'http://localhost:3001/auth/github/callback';
    client = new GithubOauthClient();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  describe('buildAuthorizeUrl', () => {
    it('builds the GitHub authorize URL with identity-only scope and the given state', () => {
      const url = new URL(client.buildAuthorizeUrl('random-state'));

      expect(url.origin + url.pathname).toBe(
        'https://github.com/login/oauth/authorize',
      );
      expect(url.searchParams.get('client_id')).toBe('client-id');
      expect(url.searchParams.get('redirect_uri')).toBe(
        'http://localhost:3001/auth/github/callback',
      );
      expect(url.searchParams.get('scope')).toBe('read:user user:email');
      expect(url.searchParams.get('state')).toBe('random-state');
    });

    it('requests the given scope override instead of the login-only default', () => {
      const url = new URL(
        client.buildAuthorizeUrl(
          'random-state',
          'read:user user:email read:project',
        ),
      );

      expect(url.searchParams.get('scope')).toBe(
        'read:user user:email read:project',
      );
    });
  });

  describe('exchangeCodeForToken', () => {
    it('exchanges the code for an access token', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          access_token: 'gho_token',
          scope: 'read:user,user:email',
          token_type: 'bearer',
        }),
      );

      const token = await client.exchangeCodeForToken('the-code');

      expect(token).toBe('gho_token');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://github.com/login/oauth/access_token',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('throws when GitHub does not return an access token', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: 'bad_verification_code' }),
      );

      await expect(client.exchangeCodeForToken('bad-code')).rejects.toThrow();
    });
  });

  describe('fetchProfile', () => {
    it('returns a profile with the verified primary email', async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({
            id: 42,
            login: 'octocat',
            name: 'The Octocat',
            avatar_url: 'https://example.com/avatar.png',
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse([
            { email: 'secondary@example.com', primary: false, verified: true },
            { email: 'octocat@example.com', primary: true, verified: true },
          ]),
        );

      const profile = await client.fetchProfile('gho_token');

      expect(profile).toEqual({
        githubId: '42',
        login: 'octocat',
        name: 'The Octocat',
        avatarUrl: 'https://example.com/avatar.png',
        verifiedEmail: 'octocat@example.com',
      });
    });

    it('returns verifiedEmail: null when no email is both primary and verified', async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({
            id: 42,
            login: 'octocat',
            name: null,
            avatar_url: 'https://example.com/avatar.png',
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse([
            { email: 'unverified@example.com', primary: true, verified: false },
          ]),
        );

      const profile = await client.fetchProfile('gho_token');

      expect(profile.verifiedEmail).toBeNull();
    });

    it('returns verifiedEmail: null when the account has no emails at all', async () => {
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse({
            id: 42,
            login: 'octocat',
            name: null,
            avatar_url: 'https://example.com/avatar.png',
          }),
        )
        .mockResolvedValueOnce(jsonResponse([]));

      const profile = await client.fetchProfile('gho_token');

      expect(profile.verifiedEmail).toBeNull();
    });
  });
});
