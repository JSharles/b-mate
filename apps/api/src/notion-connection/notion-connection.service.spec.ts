import { NotFoundException } from '@nestjs/common';
import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../test/prisma-mock';
import { decryptToken } from '../board-connections/token-encryption';
import { NotionAccessError, NotionClient } from './notion.client';
import { NotionConnectionService } from './notion-connection.service';

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

describe('NotionConnectionService', () => {
  let prisma: PrismaMock;
  let notionClient: jest.Mocked<Pick<NotionClient, 'verifyToken'>>;
  let service: NotionConnectionService;

  beforeEach(() => {
    process.env.BOARD_CONNECTION_ENCRYPTION_KEY =
      '0000000000000000000000000000000000000000000000000000000000000000';
    prisma = createPrismaMock();
    notionClient = { verifyToken: jest.fn() };
    service = new NotionConnectionService(
      asPrismaService(prisma),
      notionClient as unknown as NotionClient,
    );
  });

  afterAll(() => {
    process.env.BOARD_CONNECTION_ENCRYPTION_KEY = ORIGINAL_ENV;
  });

  describe('findForProject', () => {
    it('returns connected: false, workspaceName: null when no connection exists', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.notionConnection.findUnique.mockResolvedValue(null);

      const result = await service.findForProject('user-1', 'project-1');

      expect(result).toEqual({ connected: false, workspaceName: null });
    });

    it('returns connected: true with the stored workspace name when a connection exists', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.notionConnection.findUnique.mockResolvedValue({
        id: 'conn-1',
        projectId: 'project-1',
        encryptedToken: 'encrypted',
        workspaceName: 'Acme Workspace',
      });

      const result = await service.findForProject('user-1', 'project-1');

      expect(result).toEqual({
        connected: true,
        workspaceName: 'Acme Workspace',
      });
    });

    it('throws not found for a client-role member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(clientMembership);

      await expect(
        service.findForProject('user-1', 'project-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws not found for a non-member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.findForProject('user-1', 'project-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('connect', () => {
    it('verifies the token, encrypts it, and upserts the connection + workspace name on projectId', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      notionClient.verifyToken.mockResolvedValue({ name: 'Acme Workspace' });
      prisma.notionConnection.upsert.mockResolvedValue({
        id: 'conn-1',
        projectId: 'project-1',
        encryptedToken: 'encrypted-value',
        workspaceName: 'Acme Workspace',
      });

      const result = await service.connect(
        'user-1',
        'project-1',
        'secret-token',
      );

      expect(notionClient.verifyToken).toHaveBeenCalledWith('secret-token');
      expect(prisma.notionConnection.upsert).toHaveBeenCalledWith({
        where: { projectId: 'project-1' },
        create: {
          projectId: 'project-1',
          encryptedToken: expect.any(String) as string,
          workspaceName: 'Acme Workspace',
        },
        update: {
          encryptedToken: expect.any(String) as string,
          workspaceName: 'Acme Workspace',
        },
      });
      expect(result).toEqual({
        connected: true,
        workspaceName: 'Acme Workspace',
      });
    });

    it('persists nothing and throws a clear error when the token fails verification', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      notionClient.verifyToken.mockRejectedValue(
        new NotionAccessError('Unable to access this Notion page (status 401)'),
      );

      await expect(
        service.connect('user-1', 'project-1', 'bad-token'),
      ).rejects.toThrow();
      expect(prisma.notionConnection.upsert).not.toHaveBeenCalled();
    });

    it('throws not found for a client-role member and never calls Notion', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(clientMembership);

      await expect(
        service.connect('user-1', 'project-1', 'token'),
      ).rejects.toThrow(NotFoundException);
      expect(notionClient.verifyToken).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('deletes the connection, idempotently (deleteMany, no error if nothing was connected)', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);

      await service.disconnect('user-1', 'project-1');

      expect(prisma.notionConnection.deleteMany).toHaveBeenCalledWith({
        where: { projectId: 'project-1' },
      });
    });

    it('throws not found for a client-role member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(clientMembership);

      await expect(service.disconnect('user-1', 'project-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getDecryptedToken', () => {
    it('returns null when no connection exists', async () => {
      prisma.notionConnection.findUnique.mockResolvedValue(null);

      const result = await service.getDecryptedToken('project-1');

      expect(result).toBeNull();
    });

    it('returns the decrypted token when a connection exists', async () => {
      const { encryptToken } = jest.requireActual<
        typeof import('../board-connections/token-encryption')
      >('../board-connections/token-encryption');
      prisma.notionConnection.findUnique.mockResolvedValue({
        id: 'conn-1',
        projectId: 'project-1',
        encryptedToken: encryptToken('secret-token'),
      });

      const result = await service.getDecryptedToken('project-1');

      expect(result).toBe('secret-token');
      // Sanity check the fixture itself round-trips (guards against a
      // future encryption change silently breaking this test's setup).
      expect(decryptToken(encryptToken('secret-token'))).toBe('secret-token');
    });
  });
});
