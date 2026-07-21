import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from '../auth/auth.service';
import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../test/prisma-mock';
import { InvitationsService } from './invitations.service';

jest.mock('argon2');

const mockedArgon2 = argon2 as jest.Mocked<typeof argon2>;

const fakeInvitation = {
  id: 'invitation-1',
  projectId: 'project-1',
  email: 'client@example.com',
  role: 'client',
  isAdmin: false,
  token: 'a-random-token',
  status: 'invited',
  expiresAt: new Date(Date.now() + 60_000),
  createdAt: new Date(),
};

const adminMembership = {
  id: 'member-1',
  projectId: 'project-1',
  userId: 'user-1',
  role: 'contributor',
  isAdmin: true,
  createdAt: new Date(),
};

const fakeUser = {
  id: 'user-1',
  firstName: 'Jean',
  lastName: 'Charles',
  email: 'client@example.com',
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

describe('InvitationsService', () => {
  let prisma: PrismaMock;
  let authService: jest.Mocked<Pick<AuthService, 'createSession'>>;
  let service: InvitationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    authService = { createSession: jest.fn() };
    service = new InvitationsService(
      asPrismaService(prisma),
      authService as unknown as AuthService,
    );
  });

  describe('create', () => {
    it('creates a client, non-admin invitation with a lowercased email when the requester is an admin', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(adminMembership);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.invitation.findFirst.mockResolvedValue(null);
      prisma.invitation.create.mockResolvedValue(fakeInvitation);

      const result = await service.create('user-1', 'project-1', {
        email: 'Client@Example.com',
      });

      expect(prisma.invitation.create).toHaveBeenCalledWith({
        data: {
          projectId: 'project-1',
          email: 'client@example.com',
          role: 'client',
          isAdmin: false,
          status: 'invited',
          token: expect.stringMatching(/^[0-9a-f]{64}$/) as string,
          expiresAt: expect.any(Date) as Date,
        },
      });
      expect(result).toEqual(fakeInvitation);
    });

    it('throws not found when the requester has no membership on the project', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.create('user-1', 'project-1', { email: 'client@example.com' }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('throws forbidden when the requester is a member but not an admin', async () => {
      prisma.projectMember.findUnique.mockResolvedValue({
        ...adminMembership,
        isAdmin: false,
      });

      await expect(
        service.create('user-1', 'project-1', { email: 'client@example.com' }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('throws conflict when the invited email already belongs to the project (FR-022)', async () => {
      prisma.projectMember.findUnique
        .mockResolvedValueOnce(adminMembership) // assertIsAdmin(requester)
        .mockResolvedValueOnce({
          id: 'member-2',
          projectId: 'project-1',
          userId: 'user-2',
          role: 'client',
          isAdmin: false,
          createdAt: new Date(),
        }); // existing membership for the invited email
      prisma.user.findUnique.mockResolvedValue({ ...fakeUser, id: 'user-2' });

      await expect(
        service.create('user-1', 'project-1', { email: 'client@example.com' }),
      ).rejects.toThrow(ConflictException);

      expect(prisma.invitation.create).not.toHaveBeenCalled();
    });

    it('delegates to resend (extends expiresAt, same token) when a pending invitation already exists for that email (FR-008)', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(adminMembership);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.invitation.findFirst.mockResolvedValue(fakeInvitation);
      prisma.invitation.update.mockResolvedValue({
        ...fakeInvitation,
        expiresAt: new Date(Date.now() + 999_999),
      });

      await service.create('user-1', 'project-1', {
        email: 'client@example.com',
      });

      expect(prisma.invitation.create).not.toHaveBeenCalled();
      expect(prisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 'invitation-1' },
        data: { expiresAt: expect.any(Date) as Date },
      });
    });
  });

  describe('findAllForProject', () => {
    it('lists only pending invitations when the requester is an admin (FR-018)', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(adminMembership);
      prisma.invitation.findMany.mockResolvedValue([fakeInvitation]);

      const result = await service.findAllForProject('user-1', 'project-1');

      expect(prisma.invitation.findMany).toHaveBeenCalledWith({
        where: {
          projectId: 'project-1',
          status: 'invited',
          expiresAt: { gt: expect.any(Date) as Date },
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([fakeInvitation]);
    });

    it('throws forbidden when the requester is not an admin', async () => {
      prisma.projectMember.findUnique.mockResolvedValue({
        ...adminMembership,
        isAdmin: false,
      });

      await expect(
        service.findAllForProject('user-1', 'project-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancel', () => {
    it('cancels a pending invitation when the requester is an admin', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(adminMembership);
      prisma.invitation.findUnique.mockResolvedValue(fakeInvitation);
      prisma.invitation.update.mockResolvedValue({
        ...fakeInvitation,
        status: 'cancelled',
      });

      const result = await service.cancel(
        'user-1',
        'project-1',
        'invitation-1',
      );

      expect(prisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 'invitation-1' },
        data: { status: 'cancelled' },
      });
      expect(result.status).toBe('cancelled');
    });

    it('throws forbidden when the requester is not an admin', async () => {
      prisma.projectMember.findUnique.mockResolvedValue({
        ...adminMembership,
        isAdmin: false,
      });

      await expect(
        service.cancel('user-1', 'project-1', 'invitation-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.invitation.update).not.toHaveBeenCalled();
    });

    it('throws conflict when the invitation is not pending', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(adminMembership);
      prisma.invitation.findUnique.mockResolvedValue({
        ...fakeInvitation,
        status: 'accepted',
      });

      await expect(
        service.cancel('user-1', 'project-1', 'invitation-1'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.invitation.update).not.toHaveBeenCalled();
    });

    it('throws not found when the invitation does not belong to the project', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(adminMembership);
      prisma.invitation.findUnique.mockResolvedValue({
        ...fakeInvitation,
        projectId: 'another-project',
      });

      await expect(
        service.cancel('user-1', 'project-1', 'invitation-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('resend', () => {
    it('extends expiresAt and keeps the same token when the requester is an admin', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(adminMembership);
      prisma.invitation.findUnique.mockResolvedValue(fakeInvitation);
      const extended = {
        ...fakeInvitation,
        expiresAt: new Date(Date.now() + 999_999),
      };
      prisma.invitation.update.mockResolvedValue(extended);

      const result = await service.resend(
        'user-1',
        'project-1',
        'invitation-1',
      );

      expect(prisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 'invitation-1' },
        data: { expiresAt: expect.any(Date) as Date },
      });
      expect(result.token).toBe(fakeInvitation.token);
    });

    it('throws forbidden when the requester is not an admin', async () => {
      prisma.projectMember.findUnique.mockResolvedValue({
        ...adminMembership,
        isAdmin: false,
      });

      await expect(
        service.resend('user-1', 'project-1', 'invitation-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.invitation.update).not.toHaveBeenCalled();
    });

    it('throws conflict when the invitation is not pending', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(adminMembership);
      prisma.invitation.findUnique.mockResolvedValue({
        ...fakeInvitation,
        status: 'cancelled',
      });

      await expect(
        service.resend('user-1', 'project-1', 'invitation-1'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.invitation.update).not.toHaveBeenCalled();
    });
  });

  describe('getByToken', () => {
    it('returns invitation details, flagging that an account already exists', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        ...fakeInvitation,
        project: { title: 'Site vitrine client X' },
      });
      prisma.user.findUnique.mockResolvedValue(fakeUser);

      const result = await service.getByToken('a-random-token');

      expect(result).toEqual({
        email: 'client@example.com',
        projectTitle: 'Site vitrine client X',
        accountExists: true,
        status: 'invited',
      });
    });

    it('flags accountExists as false when no user has that email yet', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        ...fakeInvitation,
        project: { title: 'Site vitrine client X' },
      });
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getByToken('a-random-token');

      expect(result.accountExists).toBe(false);
    });

    it('reports status expired once past expiresAt', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        ...fakeInvitation,
        expiresAt: new Date(Date.now() - 60_000),
        project: { title: 'Site vitrine client X' },
      });
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getByToken('a-random-token');

      expect(result.status).toBe('expired');
    });

    it('reports status accepted when already accepted', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        ...fakeInvitation,
        status: 'accepted',
        project: { title: 'Site vitrine client X' },
      });
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getByToken('a-random-token');

      expect(result.status).toBe('accepted');
    });

    it('reports status cancelled when cancelled', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        ...fakeInvitation,
        status: 'cancelled',
        project: { title: 'Site vitrine client X' },
      });
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getByToken('a-random-token');

      expect(result.status).toBe('cancelled');
    });

    it('throws not found for an unknown token', async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);

      await expect(service.getByToken('missing-token')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('accept', () => {
    it('throws not found for an unknown token', async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);

      await expect(
        service.accept('missing-token', { password: 'supersecret123' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws gone when the invitation was already accepted', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        ...fakeInvitation,
        status: 'accepted',
      });

      await expect(
        service.accept('a-random-token', { password: 'supersecret123' }),
      ).rejects.toThrow(GoneException);
    });

    it('throws gone when the invitation has expired', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        ...fakeInvitation,
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(
        service.accept('a-random-token', { password: 'supersecret123' }),
      ).rejects.toThrow(GoneException);
    });

    it('throws gone when the invitation was cancelled, and creates no session (FR-012/FR-013/FR-014, SC-004)', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        ...fakeInvitation,
        status: 'cancelled',
      });

      await expect(
        service.accept('a-random-token', { password: 'supersecret123' }),
      ).rejects.toThrow(GoneException);

      expect(authService.createSession).not.toHaveBeenCalled();
      expect(prisma.projectMember.create).not.toHaveBeenCalled();
    });

    describe('when the invitee already has an account', () => {
      it('logs them in, grants membership and marks the invitation accepted', async () => {
        prisma.invitation.findUnique.mockResolvedValue(fakeInvitation);
        prisma.user.findUnique.mockResolvedValue(fakeUser);
        mockedArgon2.verify.mockResolvedValue(true);
        prisma.projectMember.findUnique.mockResolvedValue(null);
        authService.createSession.mockResolvedValue({
          id: 'session-1',
          userId: fakeUser.id,
          expiresAt: new Date(),
          createdAt: new Date(),
        });

        const result = await service.accept('a-random-token', {
          password: 'supersecret123',
        });

        expect(mockedArgon2.verify).toHaveBeenCalledWith(
          'hashed',
          'supersecret123',
        );
        expect(prisma.user.create).not.toHaveBeenCalled();
        expect(prisma.projectMember.create).toHaveBeenCalledWith({
          data: {
            projectId: 'project-1',
            userId: 'user-1',
            role: 'client',
            isAdmin: false,
          },
        });
        expect(prisma.invitation.update).toHaveBeenCalledWith({
          where: { id: 'invitation-1' },
          data: { status: 'accepted' },
        });
        expect(result).toEqual({ user: fakeUser, sessionId: 'session-1' });
      });

      it('throws unauthorized when the password is wrong', async () => {
        prisma.invitation.findUnique.mockResolvedValue(fakeInvitation);
        prisma.user.findUnique.mockResolvedValue(fakeUser);
        mockedArgon2.verify.mockResolvedValue(false);

        await expect(
          service.accept('a-random-token', { password: 'wrong' }),
        ).rejects.toThrow(UnauthorizedException);

        expect(prisma.projectMember.create).not.toHaveBeenCalled();
        expect(prisma.invitation.update).not.toHaveBeenCalled();
      });

      it('does not create a duplicate membership if already a member', async () => {
        prisma.invitation.findUnique.mockResolvedValue(fakeInvitation);
        prisma.user.findUnique.mockResolvedValue(fakeUser);
        mockedArgon2.verify.mockResolvedValue(true);
        prisma.projectMember.findUnique.mockResolvedValue({
          id: 'member-2',
          projectId: 'project-1',
          userId: 'user-1',
          role: 'client',
          isAdmin: true,
          createdAt: new Date(),
        });
        authService.createSession.mockResolvedValue({
          id: 'session-1',
          userId: fakeUser.id,
          expiresAt: new Date(),
          createdAt: new Date(),
        });

        await service.accept('a-random-token', { password: 'supersecret123' });

        expect(prisma.projectMember.create).not.toHaveBeenCalled();
      });
    });

    describe('when the invitee has no account yet', () => {
      it('creates the account, grants membership and marks the invitation accepted', async () => {
        prisma.invitation.findUnique.mockResolvedValue(fakeInvitation);
        prisma.user.findUnique.mockResolvedValue(null);
        mockedArgon2.hash.mockResolvedValue('hashed-password');
        prisma.user.create.mockResolvedValue(fakeUser);
        prisma.projectMember.findUnique.mockResolvedValue(null);
        authService.createSession.mockResolvedValue({
          id: 'session-1',
          userId: fakeUser.id,
          expiresAt: new Date(),
          createdAt: new Date(),
        });

        const result = await service.accept('a-random-token', {
          password: 'supersecret123',
          firstName: 'Jean',
          lastName: 'Charles',
        });

        expect(prisma.user.create).toHaveBeenCalledWith({
          data: {
            firstName: 'Jean',
            lastName: 'Charles',
            email: 'client@example.com',
            passwordHash: 'hashed-password',
          },
        });
        expect(prisma.projectMember.create).toHaveBeenCalledWith({
          data: {
            projectId: 'project-1',
            userId: 'user-1',
            role: 'client',
            isAdmin: false,
          },
        });
        expect(result).toEqual({ user: fakeUser, sessionId: 'session-1' });
      });

      it('throws bad request when firstName/lastName are missing', async () => {
        prisma.invitation.findUnique.mockResolvedValue(fakeInvitation);
        prisma.user.findUnique.mockResolvedValue(null);

        await expect(
          service.accept('a-random-token', { password: 'supersecret123' }),
        ).rejects.toThrow(BadRequestException);

        expect(prisma.user.create).not.toHaveBeenCalled();
      });
    });
  });
});
