import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../test/prisma-mock';
import { AuthService } from './auth.service';

jest.mock('argon2');

const mockedArgon2 = argon2 as jest.Mocked<typeof argon2>;

const fakeUser = {
  id: 'user-1',
  firstName: 'Jean',
  lastName: 'Charles',
  email: 'jc@example.com',
  passwordHash: 'hashed',
  company: null,
  address: null,
  phone: null,
  image: null,
  bio: null,
  github: null,
  socials: null,
  roleTitle: null,
  status: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService', () => {
  let prisma: PrismaMock;
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    service = new AuthService(asPrismaService(prisma));
  });

  describe('signup', () => {
    it('creates a user and a session when the email is not taken', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      mockedArgon2.hash.mockResolvedValue('hashed-password');
      prisma.user.create.mockResolvedValue(fakeUser);
      prisma.session.create.mockResolvedValue({
        id: 'session-1',
        userId: fakeUser.id,
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.signup({
        firstName: 'Jean',
        lastName: 'Charles',
        email: 'JC@Example.com',
        password: 'supersecret123',
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'jc@example.com' },
      });
      expect(mockedArgon2.hash).toHaveBeenCalledWith('supersecret123');
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          firstName: 'Jean',
          lastName: 'Charles',
          email: 'jc@example.com',
          passwordHash: 'hashed-password',
        },
      });
      expect(result).toEqual({ user: fakeUser, sessionId: 'session-1' });
    });

    it('rejects when the email already exists', async () => {
      prisma.user.findUnique.mockResolvedValue(fakeUser);

      await expect(
        service.signup({
          firstName: 'Jean',
          lastName: 'Charles',
          email: 'jc@example.com',
          password: 'supersecret123',
        }),
      ).rejects.toThrow(ConflictException);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });
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
});
