import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../test/prisma-mock';
import { AuthService } from './auth.service';
import type { GithubProfile } from './github-oauth.client';

jest.mock('argon2');

const mockedArgon2 = argon2 as jest.Mocked<typeof argon2>;

const fakeUser = {
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

const fakeGithubProfile: GithubProfile = {
  githubId: '42',
  login: 'octocat',
  name: 'The Octocat',
  avatarUrl: 'https://example.com/avatar.png',
  verifiedEmail: 'octocat@example.com',
};

const fakeGithubUser = {
  ...fakeUser,
  id: 'user-2',
  firstName: 'The',
  lastName: 'Octocat',
  email: 'octocat@example.com',
  passwordHash: null,
  githubId: '42',
  image: 'https://example.com/avatar.png',
};

describe('AuthService', () => {
  let prisma: PrismaMock;
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    service = new AuthService(asPrismaService(prisma));
  });

  describe('login', () => {
    it('creates a session when credentials are valid', async () => {
      prisma.user.findUnique.mockResolvedValue(fakeUser);
      mockedArgon2.verify.mockResolvedValue(true);
      prisma.session.create.mockResolvedValue({
        id: 'session-2',
        userId: fakeUser.id,
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.login({
        email: 'jc@example.com',
        password: 'supersecret123',
      });

      expect(result).toEqual({ user: fakeUser, sessionId: 'session-2' });
    });

    it('rejects when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'unknown@example.com', password: 'whatever' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when the password is wrong', async () => {
      prisma.user.findUnique.mockResolvedValue(fakeUser);
      mockedArgon2.verify.mockResolvedValue(false);

      await expect(
        service.login({ email: 'jc@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(prisma.session.create).not.toHaveBeenCalled();
    });

    it('rejects a GitHub-only account (no passwordHash) without calling argon2', async () => {
      prisma.user.findUnique.mockResolvedValue(fakeGithubUser);

      await expect(
        service.login({ email: 'octocat@example.com', password: 'anything' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockedArgon2.verify).not.toHaveBeenCalled();
      expect(prisma.session.create).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('deletes the session row', async () => {
      prisma.session.deleteMany.mockResolvedValue({ count: 1 });

      await service.logout('session-1');

      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { id: 'session-1' },
      });
    });
  });

  describe('validateSession', () => {
    it('returns the user for a valid, non-expired session', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: fakeUser.id,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        user: fakeUser,
      });

      const result = await service.validateSession('session-1');

      expect(result).toEqual(fakeUser);
    });

    it('returns null when the session does not exist', async () => {
      prisma.session.findUnique.mockResolvedValue(null);

      const result = await service.validateSession('missing');

      expect(result).toBeNull();
    });

    it('returns null when the session has expired', async () => {
      prisma.session.findUnique.mockResolvedValue({
        id: 'session-1',
        userId: fakeUser.id,
        expiresAt: new Date(Date.now() - 60_000),
        createdAt: new Date(),
        user: fakeUser,
      });

      const result = await service.validateSession('session-1');

      expect(result).toBeNull();
    });
  });

  describe('findOrCreateFromGitHub', () => {
    it('creates a new developer account when no user has this githubId', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(fakeGithubUser);
      prisma.session.create.mockResolvedValue({
        id: 'session-3',
        userId: fakeGithubUser.id,
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.findOrCreateFromGitHub(fakeGithubProfile);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { githubId: '42' },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          firstName: 'The',
          lastName: 'Octocat',
          email: 'octocat@example.com',
          passwordHash: null,
          accountKind: 'developer',
          githubId: '42',
          image: 'https://example.com/avatar.png',
        },
      });
      expect(result).toEqual({ user: fakeGithubUser, sessionId: 'session-3' });
    });

    it('logs into the existing account when the githubId is already known', async () => {
      prisma.user.findUnique.mockResolvedValue(fakeGithubUser);
      prisma.session.create.mockResolvedValue({
        id: 'session-4',
        userId: fakeGithubUser.id,
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.findOrCreateFromGitHub(fakeGithubProfile);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(result).toEqual({ user: fakeGithubUser, sessionId: 'session-4' });
    });

    it('falls back to the GitHub login as firstName, leaving lastName empty, when name has no surname', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(fakeGithubUser);
      prisma.session.create.mockResolvedValue({
        id: 'session-5',
        userId: fakeGithubUser.id,
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      await service.findOrCreateFromGitHub({
        ...fakeGithubProfile,
        name: null,
      });

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          firstName: 'octocat',
          lastName: '',
          email: 'octocat@example.com',
          passwordHash: null,
          accountKind: 'developer',
          githubId: '42',
          image: 'https://example.com/avatar.png',
        },
      });
    });

    it('throws a clean conflict error when the verified email collides with an existing account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.8.0',
          meta: { target: ['email'] },
        }),
      );

      await expect(
        service.findOrCreateFromGitHub(fakeGithubProfile),
      ).rejects.toThrow(ConflictException);
    });
  });
});
