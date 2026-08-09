import type { User } from '@prisma/client';
import type { Request, Response } from 'express';
import { BOARD_OAUTH_TOKEN_COOKIE_NAME } from '../auth/board-oauth-cookie';
import type { GithubOauthClient } from '../auth/github-oauth.client';
import { OAUTH_FLOW_COOKIE_NAME } from '../auth/oauth-state-cookie';
import { BoardConnectionsController } from './board-connections.controller';
import { BoardConnectionsService } from './board-connections.service';
import { encryptToken } from './token-encryption';

const ORIGINAL_ENV = process.env.BOARD_CONNECTION_ENCRYPTION_KEY;

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

const fakeConnection = {
  provider: 'github' as const,
  boardOwnerLogin: 'acme',
  boardOwnerType: 'Organization',
  boardNumber: 3,
  boardTitle: 'Roadmap',
  boardUrl: 'https://github.com/orgs/acme/projects/3',
  estimateUnit: 'days' as const,
  needsReconnect: false,
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

function reqWithCookies(cookies: Record<string, string>): Request {
  return { cookies } as unknown as Request;
}

describe('BoardConnectionsController', () => {
  let boardConnectionsService: jest.Mocked<
    Pick<
      BoardConnectionsService,
      | 'findForProject'
      | 'preview'
      | 'connect'
      | 'disconnect'
      | 'assertIsContributor'
    >
  >;
  let githubOauthClient: jest.Mocked<
    Pick<GithubOauthClient, 'buildAuthorizeUrl'>
  >;
  let controller: BoardConnectionsController;

  beforeEach(() => {
    process.env.BOARD_CONNECTION_ENCRYPTION_KEY =
      '0000000000000000000000000000000000000000000000000000000000000000';
    boardConnectionsService = {
      findForProject: jest.fn(),
      preview: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      assertIsContributor: jest.fn(),
    };
    githubOauthClient = { buildAuthorizeUrl: jest.fn() };
    controller = new BoardConnectionsController(
      boardConnectionsService as unknown as BoardConnectionsService,
      githubOauthClient as unknown as GithubOauthClient,
    );
  });

  afterAll(() => {
    process.env.BOARD_CONNECTION_ENCRYPTION_KEY = ORIGINAL_ENV;
  });

  it('findOne delegates to the service with the current user and project id', async () => {
    boardConnectionsService.findForProject.mockResolvedValue(fakeConnection);

    const result = await controller.findOne(fakeUser, 'project-1');

    expect(boardConnectionsService.findForProject).toHaveBeenCalledWith(
      'user-1',
      'project-1',
    );
    expect(result).toEqual(fakeConnection);
  });

  describe('authorizeGithub', () => {
    it('asserts contributor access, sets the board-connection flow cookie, and redirects to GitHub', async () => {
      boardConnectionsService.assertIsContributor.mockResolvedValue({
        id: 'member-1',
        projectId: 'project-1',
        userId: 'user-1',
        role: 'contributor',
        isAdmin: true,
        createdAt: new Date(),
      });
      githubOauthClient.buildAuthorizeUrl.mockReturnValue(
        'https://github.com/login/oauth/authorize?scope=read%3Aproject',
      );
      const res = createResponseMock();

      await controller.authorizeGithub(
        fakeUser,
        'project-1',
        'en',
        res as unknown as Response,
      );

      expect(boardConnectionsService.assertIsContributor).toHaveBeenCalledWith(
        'user-1',
        'project-1',
      );
      const [, cookieValue] = res.cookie.mock.calls[0] as [string, string];
      expect(res.cookie.mock.calls[0][0]).toBe(OAUTH_FLOW_COOKIE_NAME);
      expect(JSON.parse(cookieValue)).toMatchObject({
        locale: 'en',
        flow: 'board-connection',
        projectId: 'project-1',
      });
      expect(githubOauthClient.buildAuthorizeUrl).toHaveBeenCalledWith(
        expect.any(String),
        'read:user user:email read:project',
      );
      expect(res.redirect).toHaveBeenCalledWith(
        'https://github.com/login/oauth/authorize?scope=read%3Aproject',
      );
    });

    it('propagates the not-found error for a non-contributor without touching cookies', async () => {
      const notFound = new Error('Project not found');
      boardConnectionsService.assertIsContributor.mockRejectedValue(notFound);
      const res = createResponseMock();

      await expect(
        controller.authorizeGithub(
          fakeUser,
          'project-1',
          'en',
          res as unknown as Response,
        ),
      ).rejects.toThrow(notFound);
      expect(res.cookie).not.toHaveBeenCalled();
      expect(res.redirect).not.toHaveBeenCalled();
    });
  });

  describe('preview', () => {
    it('resolves the token from the request body when there is no board-oauth cookie', async () => {
      const boards = [
        {
          ownerLogin: 'acme',
          ownerType: 'Organization' as const,
          number: 3,
          title: 'Roadmap',
          url: 'https://github.com/orgs/acme/projects/3',
        },
      ];
      boardConnectionsService.preview.mockResolvedValue(boards);
      const req = reqWithCookies({});

      const result = await controller.preview(
        fakeUser,
        'project-1',
        { token: 'a-token' },
        req,
      );

      expect(boardConnectionsService.preview).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'a-token',
      );
      expect(result).toEqual(boards);
    });

    it('resolves the token from the board-oauth cookie when present, ignoring the body', async () => {
      boardConnectionsService.preview.mockResolvedValue([]);
      const req = reqWithCookies({
        [BOARD_OAUTH_TOKEN_COOKIE_NAME]: encryptToken('oauth-token'),
      });

      await controller.preview(
        fakeUser,
        'project-1',
        { token: 'ignored' },
        req,
      );

      expect(boardConnectionsService.preview).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'oauth-token',
      );
    });

    it('rejects with a clean 400 when neither the cookie nor the body has a token', () => {
      const req = reqWithCookies({});

      expect(() => controller.preview(fakeUser, 'project-1', {}, req)).toThrow(
        'No GitHub authorization found. Connect via GitHub or provide a token.',
      );
      expect(boardConnectionsService.preview).not.toHaveBeenCalled();
    });
  });

  describe('connect', () => {
    it('resolves the token from the request body, delegates to the service, and clears the board-oauth cookie', async () => {
      boardConnectionsService.connect.mockResolvedValue(fakeConnection);
      const req = reqWithCookies({});
      const res = createResponseMock();

      const result = await controller.connect(
        fakeUser,
        'project-1',
        {
          token: 'a-token',
          ownerLogin: 'acme',
          ownerType: 'Organization',
          number: 3,
        },
        req,
        res as unknown as Response,
      );

      expect(boardConnectionsService.connect).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'a-token',
        {
          ownerLogin: 'acme',
          ownerType: 'Organization',
          number: 3,
          estimateUnit: undefined,
        },
      );
      expect(result).toEqual(fakeConnection);
      expect(res.clearCookie).toHaveBeenCalledWith(
        BOARD_OAUTH_TOKEN_COOKIE_NAME,
        expect.any(Object),
      );
    });

    it('resolves the token from the board-oauth cookie when present', async () => {
      boardConnectionsService.connect.mockResolvedValue(fakeConnection);
      const req = reqWithCookies({
        [BOARD_OAUTH_TOKEN_COOKIE_NAME]: encryptToken('oauth-token'),
      });
      const res = createResponseMock();

      await controller.connect(
        fakeUser,
        'project-1',
        { ownerLogin: 'acme', ownerType: 'Organization', number: 3 },
        req,
        res as unknown as Response,
      );

      expect(boardConnectionsService.connect).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'oauth-token',
        expect.any(Object),
      );
    });

    it('clears the board-oauth cookie even when the service call fails', async () => {
      boardConnectionsService.connect.mockRejectedValue(new Error('boom'));
      const req = reqWithCookies({
        [BOARD_OAUTH_TOKEN_COOKIE_NAME]: encryptToken('oauth-token'),
      });
      const res = createResponseMock();

      await expect(
        controller.connect(
          fakeUser,
          'project-1',
          { ownerLogin: 'acme', ownerType: 'Organization', number: 3 },
          req,
          res as unknown as Response,
        ),
      ).rejects.toThrow('boom');
      expect(res.clearCookie).toHaveBeenCalledWith(
        BOARD_OAUTH_TOKEN_COOKIE_NAME,
        expect.any(Object),
      );
    });
  });

  it('disconnect delegates to the service with the current user and project id', async () => {
    boardConnectionsService.disconnect.mockResolvedValue(undefined);

    await controller.disconnect(fakeUser, 'project-1');

    expect(boardConnectionsService.disconnect).toHaveBeenCalledWith(
      'user-1',
      'project-1',
    );
  });
});
