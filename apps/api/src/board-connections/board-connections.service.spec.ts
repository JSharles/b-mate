import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BoardProvider } from '@prisma/client';
import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../test/prisma-mock';
import { BoardConnectionsService } from './board-connections.service';
import { GithubProjectsClient } from './github-projects.client';
import { decryptToken } from './token-encryption';

const ORIGINAL_ENV = process.env.BOARD_CONNECTION_ENCRYPTION_KEY;

const contributorMembership = {
  id: 'member-1',
  projectId: 'project-1',
  userId: 'user-1',
  role: 'contributor',
  isAdmin: true,
  createdAt: new Date(),
};

const clientMembership = {
  ...contributorMembership,
  role: 'client',
  isAdmin: false,
};

const availableBoard = {
  ownerLogin: 'acme',
  ownerType: 'Organization' as const,
  number: 3,
  title: 'Roadmap',
  url: 'https://github.com/orgs/acme/projects/3',
};

const storedConnection = {
  id: 'connection-1',
  projectId: 'project-1',
  provider: 'github' as const,
  boardOwnerLogin: 'acme',
  boardOwnerType: 'Organization',
  boardNumber: 3,
  boardTitle: 'Roadmap',
  boardUrl: 'https://github.com/orgs/acme/projects/3',
  encryptedToken: 'encrypted-value',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('BoardConnectionsService', () => {
  let prisma: PrismaMock;
  let githubClient: jest.Mocked<
    Pick<GithubProjectsClient, 'listAccessibleBoards' | 'verifyBoardAccess'>
  >;
  let service: BoardConnectionsService;

  beforeEach(() => {
    process.env.BOARD_CONNECTION_ENCRYPTION_KEY =
      '0000000000000000000000000000000000000000000000000000000000000000';
    prisma = createPrismaMock();
    githubClient = {
      listAccessibleBoards: jest.fn(),
      verifyBoardAccess: jest.fn(),
    };
    service = new BoardConnectionsService(
      asPrismaService(prisma),
      githubClient as unknown as GithubProjectsClient,
    );
  });

  afterAll(() => {
    process.env.BOARD_CONNECTION_ENCRYPTION_KEY = ORIGINAL_ENV;
  });

  describe('preview', () => {
    it('returns the boards the token can access', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      githubClient.listAccessibleBoards.mockResolvedValue([availableBoard]);

      const result = await service.preview('user-1', 'project-1', {
        token: 'a-token',
      });

      expect(githubClient.listAccessibleBoards).toHaveBeenCalledWith('a-token');
      expect(result).toEqual([availableBoard]);
    });

    it('throws not found for a client-role member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(clientMembership);

      await expect(
        service.preview('user-1', 'project-1', { token: 'a-token' }),
      ).rejects.toThrow(NotFoundException);
      expect(githubClient.listAccessibleBoards).not.toHaveBeenCalled();
    });

    it('throws not found for a non-member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.preview('user-1', 'project-1', { token: 'a-token' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('translates a GitHub client failure into a clean, sanitized 4xx (never a raw 500)', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      githubClient.listAccessibleBoards.mockRejectedValue(
        new Error('GitHub API request failed with status 401'),
      );

      await expect(
        service.preview('user-1', 'project-1', { token: 'a-token' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('connect', () => {
    it('translates a GitHub client failure into a clean, sanitized 4xx (never a raw 500)', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      githubClient.verifyBoardAccess.mockRejectedValue(
        new Error('GitHub API request failed with status 401'),
      );

      await expect(
        service.connect('user-1', 'project-1', {
          token: 'a-token',
          ownerLogin: 'acme',
          ownerType: 'Organization',
          number: 3,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.boardConnection.upsert).not.toHaveBeenCalled();
    });

    it('rejects and stores nothing when the board is not accessible (FR-002)', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      githubClient.verifyBoardAccess.mockResolvedValue(null);

      await expect(
        service.connect('user-1', 'project-1', {
          token: 'a-token',
          ownerLogin: 'acme',
          ownerType: 'Organization',
          number: 3,
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.boardConnection.upsert).not.toHaveBeenCalled();
    });

    it('encrypts the token and upserts the connection on the project', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      githubClient.verifyBoardAccess.mockResolvedValue(availableBoard);
      let capturedEncryptedToken = '';
      prisma.boardConnection.upsert.mockImplementation(
        (args: { create: { encryptedToken: string } }) => {
          capturedEncryptedToken = args.create.encryptedToken;
          return Promise.resolve(storedConnection);
        },
      );

      const result = await service.connect('user-1', 'project-1', {
        token: 'a-token',
        ownerLogin: 'acme',
        ownerType: 'Organization',
        number: 3,
      });

      expect(prisma.boardConnection.upsert).toHaveBeenCalledWith({
        where: { projectId: 'project-1' },
        create: {
          projectId: 'project-1',
          provider: BoardProvider.github,
          boardOwnerLogin: 'acme',
          boardOwnerType: 'Organization',
          boardNumber: 3,
          boardTitle: 'Roadmap',
          boardUrl: 'https://github.com/orgs/acme/projects/3',
          encryptedToken: expect.any(String) as string,
        },
        update: {
          provider: BoardProvider.github,
          boardOwnerLogin: 'acme',
          boardOwnerType: 'Organization',
          boardNumber: 3,
          boardTitle: 'Roadmap',
          boardUrl: 'https://github.com/orgs/acme/projects/3',
          encryptedToken: expect.any(String) as string,
        },
      });
      expect(decryptToken(capturedEncryptedToken)).toBe('a-token');
      expect(result).toEqual({
        provider: 'github',
        boardOwnerLogin: 'acme',
        boardOwnerType: 'Organization',
        boardNumber: 3,
        boardTitle: 'Roadmap',
        boardUrl: 'https://github.com/orgs/acme/projects/3',
      });
    });

    it('throws not found for a client-role member and never calls GitHub', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(clientMembership);

      await expect(
        service.connect('user-1', 'project-1', {
          token: 'a-token',
          ownerLogin: 'acme',
          ownerType: 'Organization',
          number: 3,
        }),
      ).rejects.toThrow(NotFoundException);
      expect(githubClient.verifyBoardAccess).not.toHaveBeenCalled();
    });

    it('replaces an existing connection via upsert rather than creating a second row (FR-006)', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      const otherBoard = {
        ownerLogin: 'someone-else',
        ownerType: 'User' as const,
        number: 7,
        title: 'Personal board',
        url: 'https://github.com/users/someone-else/projects/7',
      };
      githubClient.verifyBoardAccess.mockResolvedValue(otherBoard);
      let capturedWhere: { projectId: string } | undefined;
      prisma.boardConnection.upsert.mockImplementation(
        (args: { where: { projectId: string } }) => {
          capturedWhere = args.where;
          return Promise.resolve({
            ...storedConnection,
            boardOwnerLogin: 'someone-else',
            boardOwnerType: 'User',
            boardNumber: 7,
            boardTitle: 'Personal board',
            boardUrl: 'https://github.com/users/someone-else/projects/7',
          });
        },
      );

      const result = await service.connect('user-1', 'project-1', {
        token: 'a-different-token',
        ownerLogin: 'someone-else',
        ownerType: 'User',
        number: 7,
      });

      expect(prisma.boardConnection.upsert).toHaveBeenCalledTimes(1);
      expect(capturedWhere).toEqual({ projectId: 'project-1' });
      expect(result.boardTitle).toBe('Personal board');
    });
  });

  describe('findForProject', () => {
    it('returns null when nothing is connected', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.boardConnection.findUnique.mockResolvedValue(null);

      const result = await service.findForProject('user-1', 'project-1');

      expect(result).toBeNull();
    });

    it('returns the connection details, without the encrypted token, when one exists', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.boardConnection.findUnique.mockResolvedValue(storedConnection);

      const result = await service.findForProject('user-1', 'project-1');

      expect(result).toEqual({
        provider: 'github',
        boardOwnerLogin: 'acme',
        boardOwnerType: 'Organization',
        boardNumber: 3,
        boardTitle: 'Roadmap',
        boardUrl: 'https://github.com/orgs/acme/projects/3',
      });
      expect(result).not.toHaveProperty('encryptedToken');
    });

    it('throws not found for a client-role member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(clientMembership);

      await expect(
        service.findForProject('user-1', 'project-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('disconnect', () => {
    it('deletes the connection', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.boardConnection.deleteMany.mockResolvedValue({ count: 1 });

      await service.disconnect('user-1', 'project-1');

      expect(prisma.boardConnection.deleteMany).toHaveBeenCalledWith({
        where: { projectId: 'project-1' },
      });
    });

    it('is a no-op, not an error, when nothing is connected', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.boardConnection.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.disconnect('user-1', 'project-1'),
      ).resolves.toBeUndefined();
    });

    it('throws not found for a client-role member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(clientMembership);

      await expect(service.disconnect('user-1', 'project-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
