import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { NotionConnectionService } from '../notion-connection/notion-connection.service';
import {
  NotionAccessError,
  NotionClient,
} from '../notion-connection/notion.client';
import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../test/prisma-mock';
import { DocumentVulgarizationClient } from './document-vulgarization.client';
import { ResourceStorageClient } from './resource-storage.client';
import { ResourcesService } from './resources.service';

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

const pdfFile = {
  buffer: Buffer.from('%PDF-1.4 fake'),
  originalname: 'Architecture overview.pdf',
  mimetype: 'application/pdf',
  size: 1024,
} as Express.Multer.File;

describe('ResourcesService', () => {
  let prisma: PrismaMock;
  let storageClient: jest.Mocked<
    Pick<
      ResourceStorageClient,
      'uploadFile' | 'getPresignedDownloadUrl' | 'deleteFile'
    >
  >;
  let documentVulgarizationClient: jest.Mocked<
    Pick<DocumentVulgarizationClient, 'submitBatch'>
  >;
  let notionClient: jest.Mocked<Pick<NotionClient, 'fetchPage'>>;
  let notionConnectionService: jest.Mocked<
    Pick<NotionConnectionService, 'getDecryptedToken'>
  >;
  let service: ResourcesService;

  beforeEach(() => {
    process.env.BOARD_CONNECTION_ENCRYPTION_KEY =
      '0000000000000000000000000000000000000000000000000000000000000000';
    prisma = createPrismaMock();
    storageClient = {
      uploadFile: jest.fn(),
      getPresignedDownloadUrl: jest.fn(),
      deleteFile: jest.fn(),
    };
    documentVulgarizationClient = { submitBatch: jest.fn() };
    notionClient = { fetchPage: jest.fn() };
    notionConnectionService = { getDecryptedToken: jest.fn() };
    prisma.resourceCategory.findMany.mockResolvedValue([]);
    prisma.resourceCategoryAssignment.findMany.mockResolvedValue([]);
    service = new ResourcesService(
      asPrismaService(prisma),
      storageClient as unknown as ResourceStorageClient,
      documentVulgarizationClient as unknown as DocumentVulgarizationClient,
      notionClient as unknown as NotionClient,
      notionConnectionService as unknown as NotionConnectionService,
    );
  });

  afterAll(() => {
    process.env.BOARD_CONNECTION_ENCRYPTION_KEY = ORIGINAL_ENV;
  });

  describe('createFromUpload', () => {
    it('uploads the file, creates the resource, and submits a batch job', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      documentVulgarizationClient.submitBatch.mockResolvedValue('batch_123');
      prisma.resource.create.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        source: 'upload',
        status: 'processing',
        title: 'Architecture overview',
      });

      const result = await service.createFromUpload(
        'user-1',
        'project-1',
        pdfFile,
      );

      expect(storageClient.uploadFile).toHaveBeenCalledWith(
        expect.stringContaining('project-1'),
        pdfFile.buffer,
        'application/pdf',
      );
      expect(documentVulgarizationClient.submitBatch).toHaveBeenCalledWith(
        { kind: 'pdf', fileBuffer: pdfFile.buffer },
        'Architecture overview',
        [],
      );
      expect(prisma.resource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: 'project-1',
            source: 'upload',
            status: 'processing',
            title: 'Architecture overview',
            addedByUserId: 'user-1',
            anthropicBatchId: 'batch_123',
            originalFileMimeType: 'application/pdf',
            originalFileName: 'Architecture overview.pdf',
          }) as unknown,
        }),
      );
      expect(result.status).toBe('processing');
    });

    it('rejects an unsupported MIME type without touching storage or the AI client', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      const badFile = {
        ...pdfFile,
        mimetype: 'application/zip',
      };

      await expect(
        service.createFromUpload('user-1', 'project-1', badFile),
      ).rejects.toThrow(BadRequestException);
      expect(storageClient.uploadFile).not.toHaveBeenCalled();
      expect(documentVulgarizationClient.submitBatch).not.toHaveBeenCalled();
    });

    it('rejects a file over 25 MB without touching storage or the AI client', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      const bigFile = {
        ...pdfFile,
        size: 26 * 1024 * 1024,
      };

      await expect(
        service.createFromUpload('user-1', 'project-1', bigFile),
      ).rejects.toThrow(BadRequestException);
      expect(storageClient.uploadFile).not.toHaveBeenCalled();
    });

    it('throws not found for a client-role member and never calls storage/AI', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(clientMembership);

      await expect(
        service.createFromUpload('user-1', 'project-1', pdfFile),
      ).rejects.toThrow(NotFoundException);
      expect(storageClient.uploadFile).not.toHaveBeenCalled();
    });

    it('throws not found for a non-member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.createFromUpload('user-1', 'project-1', pdfFile),
      ).rejects.toThrow(NotFoundException);
    });

    it("passes the project's existing categories into submitBatch, key/labelEn only", async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resourceCategory.findMany.mockResolvedValue([
        {
          id: 'category-1',
          projectId: 'project-1',
          key: 'architecture-stack',
          labelEn: 'Architecture & stack',
          labelFr: 'Architecture et stack',
        },
      ]);
      documentVulgarizationClient.submitBatch.mockResolvedValue('batch_123');
      prisma.resource.create.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        source: 'upload',
        status: 'processing',
        title: 'Architecture overview',
      });

      await service.createFromUpload('user-1', 'project-1', pdfFile);

      expect(prisma.resourceCategory.findMany).toHaveBeenCalledWith({
        where: { projectId: 'project-1' },
      });
      expect(documentVulgarizationClient.submitBatch).toHaveBeenCalledWith(
        { kind: 'pdf', fileBuffer: pdfFile.buffer },
        'Architecture overview',
        [{ key: 'architecture-stack', labelEn: 'Architecture & stack' }],
      );
    });
  });

  describe('createFromNotion', () => {
    const pageUrl =
      'https://www.notion.so/My-Workspace/Architecture-overview-1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d';

    it('resolves the stored project token, verifies access, and creates the resource', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      notionConnectionService.getDecryptedToken.mockResolvedValue(
        'stored-token',
      );
      notionClient.fetchPage.mockResolvedValue({
        title: 'Architecture overview',
        content: 'This system does X.',
      });
      documentVulgarizationClient.submitBatch.mockResolvedValue('batch_123');
      prisma.resource.create.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        source: 'notion',
        status: 'processing',
        title: 'Architecture overview',
      });

      const result = await service.createFromNotion(
        'user-1',
        'project-1',
        pageUrl,
      );

      expect(notionConnectionService.getDecryptedToken).toHaveBeenCalledWith(
        'project-1',
      );
      expect(notionClient.fetchPage).toHaveBeenCalledWith(
        'stored-token',
        '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
      );
      expect(documentVulgarizationClient.submitBatch).toHaveBeenCalledWith(
        { kind: 'text', text: 'This system does X.' },
        'Architecture overview',
        [],
      );
      expect(prisma.resource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: 'project-1',
            source: 'notion',
            status: 'processing',
            title: 'Architecture overview',
            notionPageUrl: pageUrl,
            addedByUserId: 'user-1',
            anthropicBatchId: 'batch_123',
          }) as unknown,
        }),
      );
      expect(result.id).toBe('resource-1');
    });

    it('rejects with a clear 400 pointing at Settings when the project has no stored connection', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      notionConnectionService.getDecryptedToken.mockResolvedValue(null);

      await expect(
        service.createFromNotion('user-1', 'project-1', pageUrl),
      ).rejects.toThrow(BadRequestException);
      expect(notionClient.fetchPage).not.toHaveBeenCalled();
    });

    it('rejects an unparseable page URL without calling Notion', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);

      await expect(
        service.createFromNotion(
          'user-1',
          'project-1',
          'https://example.com/not-a-notion-url',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(notionClient.fetchPage).not.toHaveBeenCalled();
    });

    it('returns a clear 400 and creates nothing when the stored connection can no longer access the page', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      notionConnectionService.getDecryptedToken.mockResolvedValue(
        'stored-token',
      );
      notionClient.fetchPage.mockRejectedValue(
        new NotionAccessError('Unable to access this Notion page (status 401)'),
      );

      await expect(
        service.createFromNotion('user-1', 'project-1', pageUrl),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.resource.create).not.toHaveBeenCalled();
    });

    it('throws not found for a client-role member and never calls Notion', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(clientMembership);

      await expect(
        service.createFromNotion('user-1', 'project-1', pageUrl),
      ).rejects.toThrow(NotFoundException);
      expect(notionClient.fetchPage).not.toHaveBeenCalled();
    });
  });

  describe('findAllForProject', () => {
    const resources = [
      {
        id: 'r1',
        projectId: 'project-1',
        source: 'upload',
        status: 'processing',
        title: 'A',
        createdAt: new Date('2026-08-08T00:00:00.000Z'),
      },
      {
        id: 'r2',
        projectId: 'project-1',
        source: 'upload',
        status: 'published',
        title: 'B',
        publishedAt: new Date('2026-08-08T00:00:00.000Z'),
        createdAt: new Date('2026-08-08T00:00:00.000Z'),
      },
    ];

    it('returns every resource for a contributor', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findMany.mockResolvedValue(resources);

      const result = await service.findAllForProject(
        'user-1',
        'project-1',
        'en',
      );

      expect(prisma.resource.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId: 'project-1' } }),
      );
      expect(result).toHaveLength(2);
    });

    it('returns only published resources for a client', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(clientMembership);
      prisma.resource.findMany.mockResolvedValue([resources[1]]);

      await service.findAllForProject('user-1', 'project-1', 'en');

      expect(prisma.resource.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: 'project-1', status: 'published' },
        }),
      );
    });

    it('throws not found for a non-member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.findAllForProject('user-1', 'project-1', 'en'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    const uploadResource = {
      id: 'resource-1',
      projectId: 'project-1',
      source: 'upload',
      status: 'published',
      title: 'Architecture overview',
      originalFileKey: 'resources/project-1/a.pdf',
      originalFileName: 'a.pdf',
      originalFileMimeType: 'application/pdf',
      notionPageUrl: null,
      failureReason: null,
      publishedAt: new Date('2026-08-08T00:00:00.000Z'),
      createdAt: new Date('2026-08-08T00:00:00.000Z'),
    };

    it('resolves vulgarizedTitle/vulgarizedContent from the matching locale row', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue(uploadResource);
      prisma.resourceVulgarization.findUnique.mockResolvedValue({
        title: 'Titre FR',
        content: 'Contenu FR',
      });
      storageClient.getPresignedDownloadUrl.mockResolvedValue(
        'https://r2.example.com/signed',
      );

      const result = await service.findOne(
        'user-1',
        'project-1',
        'resource-1',
        'fr',
      );

      expect(prisma.resourceVulgarization.findUnique).toHaveBeenCalledWith({
        where: {
          resourceId_locale: { resourceId: 'resource-1', locale: 'fr' },
        },
      });
      expect(result.vulgarizedTitle).toBe('Titre FR');
      expect(result.vulgarizedContent).toBe('Contenu FR');
    });

    it('attaches a presigned originalFileUrl for a published, upload-sourced resource', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue(uploadResource);
      prisma.resourceVulgarization.findUnique.mockResolvedValue(null);
      storageClient.getPresignedDownloadUrl.mockResolvedValue(
        'https://r2.example.com/signed',
      );

      const result = await service.findOne(
        'user-1',
        'project-1',
        'resource-1',
        'en',
      );

      expect(storageClient.getPresignedDownloadUrl).toHaveBeenCalledWith(
        'resources/project-1/a.pdf',
        expect.any(Number),
      );
      expect(result.originalFileUrl).toBe('https://r2.example.com/signed');
    });

    it('returns notionPageUrl and no file URL for a notion-sourced resource', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue({
        ...uploadResource,
        source: 'notion',
        originalFileKey: null,
        notionPageUrl: 'https://notion.so/page',
      });
      prisma.resourceVulgarization.findUnique.mockResolvedValue(null);

      const result = await service.findOne(
        'user-1',
        'project-1',
        'resource-1',
        'en',
      );

      expect(storageClient.getPresignedDownloadUrl).not.toHaveBeenCalled();
      expect(result.notionPageUrl).toBe('https://notion.so/page');
      expect(result.originalFileUrl).toBeNull();
    });

    it('throws not found for a client requesting a non-published resource', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(clientMembership);
      prisma.resource.findUnique.mockResolvedValue({
        ...uploadResource,
        status: 'processing',
      });

      await expect(
        service.findOne('user-1', 'project-1', 'resource-1', 'en'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws not found when the resource does not exist', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne('user-1', 'project-1', 'resource-1', 'en'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws not found when the resource belongs to a different project', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue({
        ...uploadResource,
        projectId: 'other-project',
      });

      await expect(
        service.findOne('user-1', 'project-1', 'resource-1', 'en'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('publish', () => {
    it('sets status: published, publishedAt, and publishedByUserId from ready_for_review', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        status: 'ready_for_review',
      });
      prisma.resource.update.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        status: 'published',
      });

      await service.publish('user-1', 'project-1', 'resource-1');

      expect(prisma.resource.update).toHaveBeenCalledWith({
        where: { id: 'resource-1' },
        data: expect.objectContaining({
          status: 'published',
          publishedByUserId: 'user-1',
          publishedAt: expect.any(Date) as unknown,
        }) as unknown,
      });
    });

    it('rejects publishing a resource that is not ready_for_review', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        status: 'processing',
      });

      await expect(
        service.publish('user-1', 'project-1', 'resource-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.resource.update).not.toHaveBeenCalled();
    });

    it('throws not found for a client-role member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(clientMembership);

      await expect(
        service.publish('user-1', 'project-1', 'resource-1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.resource.findUnique).not.toHaveBeenCalled();
    });

    it('throws not found when the resource does not exist', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue(null);

      await expect(
        service.publish('user-1', 'project-1', 'resource-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('deletes the resource row and its original file from storage for an upload-sourced resource', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        source: 'upload',
        originalFileKey: 'resources/project-1/a.pdf',
      });

      await service.delete('user-1', 'project-1', 'resource-1');

      expect(storageClient.deleteFile).toHaveBeenCalledWith(
        'resources/project-1/a.pdf',
      );
      expect(prisma.resource.delete).toHaveBeenCalledWith({
        where: { id: 'resource-1' },
      });
    });

    // NotionConnection is project-level (schema.prisma), not tied to any
    // single resource — deleting one Notion-sourced resource must NOT
    // touch the project's stored connection, since it's meant to be reused
    // for other Notion resources in the same project.
    it('deletes the resource row without touching storage or the project-level NotionConnection for a notion-sourced resource', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        source: 'notion',
        originalFileKey: null,
      });

      await service.delete('user-1', 'project-1', 'resource-1');

      expect(storageClient.deleteFile).not.toHaveBeenCalled();
      expect(prisma.notionConnection.delete).not.toHaveBeenCalled();
      expect(prisma.resource.delete).toHaveBeenCalledWith({
        where: { id: 'resource-1' },
      });
    });

    it("is allowed regardless of the resource's current status", async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        source: 'upload',
        status: 'published',
        originalFileKey: 'resources/project-1/a.pdf',
      });

      await expect(
        service.delete('user-1', 'project-1', 'resource-1'),
      ).resolves.toBeUndefined();
    });

    it('throws not found for a client-role member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(clientMembership);

      await expect(
        service.delete('user-1', 'project-1', 'resource-1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.resource.delete).not.toHaveBeenCalled();
    });

    it('throws not found when the resource does not exist', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue(null);

      await expect(
        service.delete('user-1', 'project-1', 'resource-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('categories in resource responses', () => {
    const uploadResource = {
      id: 'resource-1',
      projectId: 'project-1',
      source: 'upload',
      status: 'published',
      title: 'Architecture overview',
      originalFileKey: null,
      originalFileName: null,
      originalFileMimeType: null,
      notionPageUrl: null,
      failureReason: null,
      publishedAt: new Date('2026-08-08T00:00:00.000Z'),
      createdAt: new Date('2026-08-08T00:00:00.000Z'),
    };

    const assignment = {
      id: 'assignment-1',
      resourceId: 'resource-1',
      categoryId: 'category-1',
      status: 'approved',
      category: {
        id: 'category-1',
        key: 'architecture-stack',
        labelEn: 'Architecture & stack',
        labelFr: 'Architecture et stack',
      },
    };

    it('includes categories on the list endpoint, resolved to the caller locale', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findMany.mockResolvedValue([uploadResource]);
      prisma.resourceCategoryAssignment.findMany.mockResolvedValue([
        assignment,
      ]);

      const result = await service.findAllForProject(
        'user-1',
        'project-1',
        'fr',
      );

      expect(result[0].categories).toEqual([
        {
          id: 'assignment-1',
          categoryId: 'category-1',
          key: 'architecture-stack',
          label: 'Architecture et stack',
          status: 'approved',
        },
      ]);
    });

    it('only queries approved assignments for a client, all statuses for a contributor', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(clientMembership);
      prisma.resource.findMany.mockResolvedValue([uploadResource]);

      await service.findAllForProject('user-1', 'project-1', 'en');

      expect(prisma.resourceCategoryAssignment.findMany).toHaveBeenCalledWith({
        where: { resourceId: 'resource-1', status: 'approved' },
        include: { category: true },
      });
    });
  });

  describe('approveCategory / rejectCategory', () => {
    const proposedAssignment = {
      id: 'assignment-1',
      resourceId: 'resource-1',
      categoryId: 'category-1',
      status: 'proposed',
    };

    it('approves a proposed assignment', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resourceCategoryAssignment.findUnique.mockResolvedValue(
        proposedAssignment,
      );
      prisma.resource.findUnique.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
      });

      await service.approveCategory(
        'user-1',
        'project-1',
        'resource-1',
        'assignment-1',
      );

      expect(prisma.resourceCategoryAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: { status: 'approved' },
      });
    });

    it('rejects a proposed assignment without touching the resource', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resourceCategoryAssignment.findUnique.mockResolvedValue(
        proposedAssignment,
      );
      prisma.resource.findUnique.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
      });

      await service.rejectCategory(
        'user-1',
        'project-1',
        'resource-1',
        'assignment-1',
      );

      expect(prisma.resourceCategoryAssignment.update).toHaveBeenCalledWith({
        where: { id: 'assignment-1' },
        data: { status: 'rejected' },
      });
      expect(prisma.resource.update).not.toHaveBeenCalled();
    });

    it('rejects re-deciding an assignment that is already approved/rejected', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resourceCategoryAssignment.findUnique.mockResolvedValue({
        ...proposedAssignment,
        status: 'approved',
      });
      prisma.resource.findUnique.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
      });

      await expect(
        service.approveCategory(
          'user-1',
          'project-1',
          'resource-1',
          'assignment-1',
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.resourceCategoryAssignment.update).not.toHaveBeenCalled();
    });

    it('throws not found when the assignment does not belong to the given resource', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resourceCategoryAssignment.findUnique.mockResolvedValue({
        ...proposedAssignment,
        resourceId: 'some-other-resource',
      });

      await expect(
        service.approveCategory(
          'user-1',
          'project-1',
          'resource-1',
          'assignment-1',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.resourceCategoryAssignment.update).not.toHaveBeenCalled();
    });

    it('throws not found when the resource belongs to a different project', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resourceCategoryAssignment.findUnique.mockResolvedValue(
        proposedAssignment,
      );
      prisma.resource.findUnique.mockResolvedValue({
        id: 'resource-1',
        projectId: 'other-project',
      });

      await expect(
        service.approveCategory(
          'user-1',
          'project-1',
          'resource-1',
          'assignment-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws not found when the assignment does not exist', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resourceCategoryAssignment.findUnique.mockResolvedValue(null);

      await expect(
        service.approveCategory(
          'user-1',
          'project-1',
          'resource-1',
          'assignment-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws not found for a client-role member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(clientMembership);

      await expect(
        service.approveCategory(
          'user-1',
          'project-1',
          'resource-1',
          'assignment-1',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(
        prisma.resourceCategoryAssignment.findUnique,
      ).not.toHaveBeenCalled();
    });
  });
});
