import type { User } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { GithubOauthClient } from './github-oauth.client';
import {
  OAUTH_FLOW_COOKIE_NAME,
  serializeOAuthFlowCookie,
} from './oauth-state-cookie';
import { SESSION_COOKIE_NAME } from './session-cookie';

const fakeUser: User = {
  id: 'user-1',
  firstName: 'Jean',
  lastName: 'Charles',
  email: 'jc@example.com',
  passwordHash: 'hashed',
  accountKind: 'developer',
  company: null,
  address: null,
  phone: null,
  image: null,
  bio: null,
  github: null,
  githubId: null,
  socials: null,
  linkedin: null,
  malt: null,
  website: null,
  roleTitle: null,
  status: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createResponseMock(): jest.Mocked<
  Pick<Response, 'cookie' | 'clearCookie' | 'redirect'>
> {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    redirect: jest.fn(),
  };
}

describe('AuthController', () => {
  let authService: jest.Mocked<
    Pick<
      AuthService,
      'login' | 'logout' | 'findOrCreateFromGitHub' | 'updateProfile'
    >
  >;
  let githubOauthClient: jest.Mocked<
    Pick<
      GithubOauthClient,
      'buildAuthorizeUrl' | 'exchangeCodeForToken' | 'fetchProfile'
    >
  >;
  let controller: AuthController;

  beforeEach(() => {
    process.env.WEB_ORIGIN = 'http://localhost:3000';
    process.env.BOARD_CONNECTION_ENCRYPTION_KEY =
      '0000000000000000000000000000000000000000000000000000000000000000';
    authService = {
      login: jest.fn(),
      logout: jest.fn(),
      findOrCreateFromGitHub: jest.fn(),
      updateProfile: jest.fn(),
    };
    githubOauthClient = {
      buildAuthorizeUrl: jest.fn(),
      exchangeCodeForToken: jest.fn(),
      fetchProfile: jest.fn(),
    };
    controller = new AuthController(
      authService as unknown as AuthService,
      githubOauthClient as unknown as GithubOauthClient,
    );
  });

  it('login sets the session cookie and returns the user without the password hash', async () => {
    authService.login.mockResolvedValue({
      user: fakeUser,
      sessionId: 'session-2',
    });
    const res = createResponseMock();

    const result = await controller.login(
      { email: 'jc@example.com', password: 'supersecret123' },
      res as unknown as Response,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      'session-2',
      expect.any(Object),
    );
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('logout clears the cookie and deletes the session when one is present', async () => {
    const res = createResponseMock();
    const req = {
      cookies: { [SESSION_COOKIE_NAME]: 'session-1' },
    } as unknown as Request;

    const result = await controller.logout(req, res as unknown as Response);

    expect(authService.logout).toHaveBeenCalledWith('session-1');
    expect(res.clearCookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      expect.any(Object),
    );
    expect(result).toEqual({ success: true });
  });

  it('logout is a no-op on the service when there is no cookie, but still clears it client-side', async () => {
    const res = createResponseMock();
    const req = { cookies: {} } as unknown as Request;

    await controller.logout(req, res as unknown as Response);

    expect(authService.logout).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('me returns the current user without the password hash', () => {
    const result = controller.me(fakeUser);

    expect(result).not.toHaveProperty('passwordHash');
    expect(result).toMatchObject({ id: 'user-1', email: 'jc@example.com' });
  });

  it('updateMe delegates to the service with the current user and dto, and returns the result without the password hash', async () => {
    authService.updateProfile.mockResolvedValue({
      ...fakeUser,
      roleTitle: 'Full-stack developer',
      linkedin: 'in/jc',
    });

    const result = await controller.updateMe(fakeUser, {
      roleTitle: 'Full-stack developer',
      linkedin: 'in/jc',
    });

    expect(authService.updateProfile).toHaveBeenCalledWith('user-1', {
      roleTitle: 'Full-stack developer',
      linkedin: 'in/jc',
    });
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).toMatchObject({
      roleTitle: 'Full-stack developer',
      linkedin: 'in/jc',
    });
  });

  describe('githubStart', () => {
    it('sets the flow cookie and redirects to the authorize URL', () => {
      githubOauthClient.buildAuthorizeUrl.mockReturnValue(
        'https://github.com/login/oauth/authorize?state=abc',
      );
      const res = createResponseMock();

      controller.githubStart('en', res as unknown as Response);

      expect(res.cookie).toHaveBeenCalledWith(
        OAUTH_FLOW_COOKIE_NAME,
        expect.any(String),
        expect.any(Object),
      );
      const [, cookieValue] = res.cookie.mock.calls[0] as [string, string];
      expect(JSON.parse(cookieValue)).toMatchObject({
        locale: 'en',
        flow: 'login',
      });
      expect(githubOauthClient.buildAuthorizeUrl).toHaveBeenCalledWith(
        expect.any(String),
      );
      expect(res.redirect).toHaveBeenCalledWith(
        'https://github.com/login/oauth/authorize?state=abc',
      );
    });

    it('falls back to the default locale when none/invalid is given', () => {
      githubOauthClient.buildAuthorizeUrl.mockReturnValue(
        'https://github.com/x',
      );
      const res = createResponseMock();

      controller.githubStart('xx', res as unknown as Response);

      const [, cookieValue] = res.cookie.mock.calls[0] as [string, string];
      expect(JSON.parse(cookieValue)).toMatchObject({ locale: 'fr' });
    });
  });

  describe('githubCallback', () => {
    function reqWithFlowCookie(state: string, locale = 'en'): Request {
      return {
        cookies: {
          [OAUTH_FLOW_COOKIE_NAME]: serializeOAuthFlowCookie({
            state,
            locale,
            flow: 'login',
          }),
        },
      } as unknown as Request;
    }

    it('rejects and redirects when state does not match the flow cookie', async () => {
      const req = reqWithFlowCookie('expected-state');
      const res = createResponseMock();

      await controller.githubCallback(
        'code',
        'wrong-state',
        req,
        res as unknown as Response,
      );

      expect(res.clearCookie).toHaveBeenCalledWith(
        OAUTH_FLOW_COOKIE_NAME,
        expect.any(Object),
      );
      expect(authService.findOrCreateFromGitHub).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/en/login?error=state_mismatch',
      );
    });

    it('rejects and redirects when there is no flow cookie at all', async () => {
      const req = { cookies: {} } as unknown as Request;
      const res = createResponseMock();

      await controller.githubCallback(
        'code',
        'any-state',
        req,
        res as unknown as Response,
      );

      expect(authService.findOrCreateFromGitHub).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/fr/login?error=state_mismatch',
      );
    });

    it('redirects with an error when GitHub returns no verified email', async () => {
      const req = reqWithFlowCookie('matching-state');
      const res = createResponseMock();
      githubOauthClient.exchangeCodeForToken.mockResolvedValue('token');
      githubOauthClient.fetchProfile.mockResolvedValue({
        githubId: '42',
        login: 'octocat',
        name: 'The Octocat',
        avatarUrl: 'https://example.com/avatar.png',
        verifiedEmail: null,
      });

      await controller.githubCallback(
        'code',
        'matching-state',
        req,
        res as unknown as Response,
      );

      expect(authService.findOrCreateFromGitHub).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/en/login?error=github_email_required',
      );
    });

    it('redirects with a generic error when the GitHub exchange fails', async () => {
      const req = reqWithFlowCookie('matching-state');
      const res = createResponseMock();
      githubOauthClient.exchangeCodeForToken.mockRejectedValue(
        new Error('network down'),
      );

      await controller.githubCallback(
        'code',
        'matching-state',
        req,
        res as unknown as Response,
      );

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/en/login?error=github_auth_failed',
      );
    });

    it('on success sets the session cookie and redirects to the locale-aware dashboard', async () => {
      const req = reqWithFlowCookie('matching-state', 'fr');
      const res = createResponseMock();
      githubOauthClient.exchangeCodeForToken.mockResolvedValue('token');
      githubOauthClient.fetchProfile.mockResolvedValue({
        githubId: '42',
        login: 'octocat',
        name: 'The Octocat',
        avatarUrl: 'https://example.com/avatar.png',
        verifiedEmail: 'octocat@example.com',
      });
      authService.findOrCreateFromGitHub.mockResolvedValue({
        user: fakeUser,
        sessionId: 'session-9',
      });

      await controller.githubCallback(
        'code',
        'matching-state',
        req,
        res as unknown as Response,
      );

      expect(res.cookie).toHaveBeenCalledWith(
        SESSION_COOKIE_NAME,
        'session-9',
        expect.any(Object),
      );
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/fr/home',
      );
    });

    describe('board-connection flow', () => {
      function reqWithBoardFlowCookie(state: string, locale = 'en'): Request {
        return {
          cookies: {
            [OAUTH_FLOW_COOKIE_NAME]: serializeOAuthFlowCookie({
              state,
              locale,
              flow: 'board-connection',
              projectId: 'project-1',
            }),
          },
        } as unknown as Request;
      }

      it('on success sets the board_oauth_token cookie and redirects to the project page with connectBoard=1', async () => {
        const req = reqWithBoardFlowCookie('matching-state', 'fr');
        const res = createResponseMock();
        githubOauthClient.exchangeCodeForToken.mockResolvedValue(
          'gho_board_token',
        );

        await controller.githubCallback(
          'code',
          'matching-state',
          req,
          res as unknown as Response,
        );

        expect(authService.findOrCreateFromGitHub).not.toHaveBeenCalled();
        expect(githubOauthClient.fetchProfile).not.toHaveBeenCalled();
        expect(res.cookie).toHaveBeenCalledWith(
          'board_oauth_token',
          expect.any(String),
          expect.any(Object),
        );
        expect(res.redirect).toHaveBeenCalledWith(
          'http://localhost:3000/fr/projects/project-1?connectBoard=1',
        );
      });

      it('redirects to the project page with an error when the exchange fails, and sets no board_oauth_token cookie', async () => {
        const req = reqWithBoardFlowCookie('matching-state', 'en');
        const res = createResponseMock();
        githubOauthClient.exchangeCodeForToken.mockRejectedValue(
          new Error('network down'),
        );

        await controller.githubCallback(
          'code',
          'matching-state',
          req,
          res as unknown as Response,
        );

        expect(res.cookie).not.toHaveBeenCalled();
        expect(res.redirect).toHaveBeenCalledWith(
          'http://localhost:3000/en/projects/project-1?boardConnectError=github_auth_failed',
        );
      });

      it('still rejects on a state mismatch, before ever branching into the board-connection flow', async () => {
        const req = reqWithBoardFlowCookie('expected-state');
        const res = createResponseMock();

        await controller.githubCallback(
          'code',
          'wrong-state',
          req,
          res as unknown as Response,
        );

        expect(githubOauthClient.exchangeCodeForToken).not.toHaveBeenCalled();
        expect(res.redirect).toHaveBeenCalledWith(
          'http://localhost:3000/en/login?error=state_mismatch',
        );
      });
    });
  });
});
