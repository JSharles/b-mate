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
import { ImageNormalizationError, ImageNormalizer } from './image-normalizer';
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

const pngFile = {
  buffer: Buffer.from('fake oversized png bytes'),
  originalname: 'MDW_SPORTS-ARCHITECTURE-2.png',
  mimetype: 'image/png',
  size: 732_514,
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
  let imageNormalizer: jest.Mocked<Pick<ImageNormalizer, 'normalize'>>;
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
    imageNormalizer = { normalize: jest.fn() };
    notionClient = { fetchPage: jest.fn() };
    notionConnectionService = { getDecryptedToken: jest.fn() };
    prisma.resourceSection.findMany.mockResolvedValue([]);
    // Publishing requires at least one approved section (research.md
    // Decision 4); the dedicated test below overrides this.
    prisma.resourceSection.count.mockResolvedValue(1);
    service = new ResourcesService(
      asPrismaService(prisma),
      storageClient as unknown as ResourceStorageClient,
      documentVulgarizationClient as unknown as DocumentVulgarizationClient,
      imageNormalizer as unknown as ImageNormalizer,
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

    // specs/014-category-sections FR-023/FR-024. The real defect this covers:
    // an 8929 x 7392 px diagram was forwarded untouched and rejected by the
    // provider at batch-execution time, minutes after the upload appeared to
    // succeed.
    it('normalizes an image before analysis while storing the original untouched', async () => {
      const normalizedBuffer = Buffer.from('resized png bytes');
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      imageNormalizer.normalize.mockResolvedValue({
        buffer: normalizedBuffer,
        mimeType: 'image/png',
      });
      documentVulgarizationClient.submitBatch.mockResolvedValue('batch_123');
      prisma.resource.create.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        source: 'upload',
        status: 'processing',
        title: 'MDW_SPORTS-ARCHITECTURE-2',
      });

      await service.createFromUpload('user-1', 'project-1', pngFile);

      expect(imageNormalizer.normalize).toHaveBeenCalledWith(
        pngFile.buffer,
        'image/png',
      );
      // Analysis gets the normalized copy...
      expect(documentVulgarizationClient.submitBatch).toHaveBeenCalledWith(
        { kind: 'image', fileBuffer: normalizedBuffer, mimeType: 'image/png' },
        'MDW_SPORTS-ARCHITECTURE-2',
      );
      // ...while what a reader downloads later is still the original.
      expect(storageClient.uploadFile).toHaveBeenCalledWith(
        expect.any(String),
        pngFile.buffer,
        'image/png',
      );
    });

    it('carries a format change through to the analysis source', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      imageNormalizer.normalize.mockResolvedValue({
        buffer: Buffer.from('recompressed'),
        mimeType: 'image/jpeg',
      });
      documentVulgarizationClient.submitBatch.mockResolvedValue('batch_123');
      prisma.resource.create.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        source: 'upload',
        status: 'processing',
        title: 'MDW_SPORTS-ARCHITECTURE-2',
      });

      await service.createFromUpload('user-1', 'project-1', pngFile);

      expect(documentVulgarizationClient.submitBatch).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: 'image/jpeg' }),
        expect.any(String),
      );
    });

    it('never normalizes a non-image format', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      documentVulgarizationClient.submitBatch.mockResolvedValue('batch_123');
      prisma.resource.create.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        source: 'upload',
        status: 'processing',
        title: 'Architecture overview',
      });

      await service.createFromUpload('user-1', 'project-1', pdfFile);

      expect(imageNormalizer.normalize).not.toHaveBeenCalled();
    });

    // FR-025: told at upload time, rather than becoming a resource that fails
    // silently minutes later.
    it('rejects an unreadable image with a 400 and creates no resource', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      imageNormalizer.normalize.mockRejectedValue(
        new ImageNormalizationError('Unreadable image: truncated'),
      );

      await expect(
        service.createFromUpload('user-1', 'project-1', pngFile),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(documentVulgarizationClient.submitBatch).not.toHaveBeenCalled();
      expect(prisma.resource.create).not.toHaveBeenCalled();
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

    // Q1: the whole-document rewrite is gone; a resource's readable content
    // is its sections, resolved to the caller's locale.
    it('resolves each section title/content from the caller locale', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue(uploadResource);
      prisma.resourceSection.findMany.mockResolvedValue([
        {
          id: 'section-1',
          categoryKey: 'overview',
          status: 'approved',
          position: 0,
          titleEn: 'The project',
          contentEn: 'Content EN',
          titleFr: 'Le projet',
          contentFr: 'Contenu FR',
        },
      ]);
      storageClient.getPresignedDownloadUrl.mockResolvedValue(
        'https://r2.example.com/signed',
      );

      const result = await service.findOne(
        'user-1',
        'project-1',
        'resource-1',
        'fr',
      );

      expect(result.sections).toEqual([
        {
          id: 'section-1',
          categoryKey: 'overview',
          status: 'approved',
          title: 'Le projet',
          content: 'Contenu FR',
        },
      ]);
    });

    it('attaches a presigned originalFileUrl for a published, upload-sourced resource', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue(uploadResource);
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

    // Q2: the detail endpoint is now the contributor's review screen. A
    // client is refused whatever the resource's status — including a
    // published one they can perfectly well read inline from the list.
    it('throws not found for a client, even for a published resource', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(clientMembership);
      prisma.resource.findUnique.mockResolvedValue(uploadResource);

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

    // research.md Decision 4: a published resource with nothing approved
    // contributes to no tab (FR-018) — published yet invisible, which reads
    // as a bug to both roles.
    it('refuses to publish when no section has been approved', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        status: 'ready_for_review',
      });
      prisma.resourceSection.count.mockResolvedValue(0);

      await expect(
        service.publish('user-1', 'project-1', 'resource-1'),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.resource.update).not.toHaveBeenCalled();
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

  describe('sections in resource responses', () => {
    const publishedResource = {
      id: 'resource-1',
      projectId: 'project-1',
      source: 'upload' as const,
      status: 'published' as const,
      title: 'Architecture overview',
      originalFileKey: 'resources/project-1/a.pdf',
      originalFileName: 'a.pdf',
      originalFileMimeType: 'application/pdf',
      notionPageUrl: null,
      failureReason: null,
      publishedAt: new Date('2026-08-08T00:00:00.000Z'),
      createdAt: new Date('2026-08-08T00:00:00.000Z'),
    };

    const storedSection = {
      id: 'section-1',
      categoryKey: 'overview',
      status: 'approved',
      position: 0,
      titleEn: 'The project',
      contentEn: 'Content EN',
      titleFr: 'Le projet',
      contentFr: 'Contenu FR',
    };

    // FR-019: this is the change that makes reading-without-navigating
    // possible. The old list returned titles only, which is precisely why a
    // client had to click into a document to read anything.
    it('includes sections with their full content on the list endpoint', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findMany.mockResolvedValue([publishedResource]);
      prisma.resourceSection.findMany.mockResolvedValue([storedSection]);
      storageClient.getPresignedDownloadUrl.mockResolvedValue(
        'https://r2.example.com/signed',
      );

      const [resource] = await service.findAllForProject(
        'user-1',
        'project-1',
        'fr',
      );

      expect(resource.sections).toEqual([
        {
          id: 'section-1',
          categoryKey: 'overview',
          status: 'approved',
          title: 'Le projet',
          content: 'Contenu FR',
        },
      ]);
    });

    // FR-020: an accordion block offers the source document, so the list has
    // to carry the presigned URL too — not just the detail endpoint.
    it('presigns the original file URL on the list endpoint', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findMany.mockResolvedValue([publishedResource]);
      storageClient.getPresignedDownloadUrl.mockResolvedValue(
        'https://r2.example.com/signed',
      );

      const [resource] = await service.findAllForProject(
        'user-1',
        'project-1',
        'en',
      );

      expect(resource.originalFileUrl).toBe('https://r2.example.com/signed');
    });

    // FR-016: a client must not be able to observe that a rejected section
    // ever existed. Enforced in the query, not by filtering afterwards.
    it('queries only approved sections for a client, every status for a contributor', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(clientMembership);
      prisma.resource.findMany.mockResolvedValue([publishedResource]);

      await service.findAllForProject('user-1', 'project-1', 'en');

      expect(prisma.resourceSection.findMany).toHaveBeenCalledWith({
        where: { resourceId: 'resource-1', status: 'approved' },
        orderBy: { position: 'asc' },
      });

      prisma.resourceSection.findMany.mockClear();
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);

      await service.findAllForProject('user-1', 'project-1', 'en');

      expect(prisma.resourceSection.findMany).toHaveBeenCalledWith({
        where: { resourceId: 'resource-1' },
        orderBy: { position: 'asc' },
      });
    });
  });

  describe('approveSection / rejectSection / moveSection', () => {
    const proposedSection = {
      id: 'section-1',
      resourceId: 'resource-1',
      categoryKey: 'overview',
      status: 'proposed',
      position: 0,
    };

    function arrangeContributorWithSection(section = proposedSection) {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resourceSection.findUnique.mockResolvedValue(section);
      prisma.resource.findUnique.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
      });
    }

    it('approves a proposed section without touching the resource', async () => {
      arrangeContributorWithSection();

      await service.approveSection(
        'user-1',
        'project-1',
        'resource-1',
        'section-1',
      );

      expect(prisma.resourceSection.update).toHaveBeenCalledWith({
        where: { id: 'section-1' },
        data: { status: 'approved' },
      });
      expect(prisma.resource.update).not.toHaveBeenCalled();
    });

    it('rejects a proposed section without touching the resource', async () => {
      arrangeContributorWithSection();

      await service.rejectSection(
        'user-1',
        'project-1',
        'resource-1',
        'section-1',
      );

      expect(prisma.resourceSection.update).toHaveBeenCalledWith({
        where: { id: 'section-1' },
        data: { status: 'rejected' },
      });
      expect(prisma.resource.update).not.toHaveBeenCalled();
    });

    // FR-015: re-filing changes the category and nothing else.
    it('moves a section to a free category, preserving its content', async () => {
      arrangeContributorWithSection();
      prisma.resourceSection.findUnique
        .mockResolvedValueOnce(proposedSection)
        .mockResolvedValueOnce(null);

      await service.moveSection(
        'user-1',
        'project-1',
        'resource-1',
        'section-1',
        'planning',
      );

      expect(prisma.resourceSection.update).toHaveBeenCalledWith({
        where: { id: 'section-1' },
        data: { categoryKey: 'planning' },
      });
    });

    it('is a no-op when the section is already in the target category', async () => {
      arrangeContributorWithSection();

      await service.moveSection(
        'user-1',
        'project-1',
        'resource-1',
        'section-1',
        'overview',
      );

      expect(prisma.resourceSection.update).not.toHaveBeenCalled();
    });

    // Merging two independently written rewrites produces incoherent prose
    // (spec.md Assumptions) — the contributor rejects one and moves the other.
    it('refuses a move into a category this document already occupies', async () => {
      arrangeContributorWithSection();
      prisma.resourceSection.findUnique
        .mockResolvedValueOnce(proposedSection)
        .mockResolvedValueOnce({ id: 'section-2', categoryKey: 'planning' });

      await expect(
        service.moveSection(
          'user-1',
          'project-1',
          'resource-1',
          'section-1',
          'planning',
        ),
      ).rejects.toThrow(ConflictException);
      expect(prisma.resourceSection.update).not.toHaveBeenCalled();
    });

    // research.md Decision 4: moving after approval would silently pull a
    // section out of a tab a client is already reading.
    it('refuses to move a section that is no longer proposed', async () => {
      arrangeContributorWithSection({ ...proposedSection, status: 'approved' });

      await expect(
        service.moveSection(
          'user-1',
          'project-1',
          'resource-1',
          'section-1',
          'planning',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('refuses to re-decide a section that is already approved or rejected', async () => {
      arrangeContributorWithSection({ ...proposedSection, status: 'rejected' });

      await expect(
        service.approveSection(
          'user-1',
          'project-1',
          'resource-1',
          'section-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    // Constitution V: "not found", "belongs to another resource", "belongs to
    // another project" and "not a contributor" are one indistinguishable
    // response.
    it('throws not found when the section belongs to a different resource', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resourceSection.findUnique.mockResolvedValue({
        ...proposedSection,
        resourceId: 'resource-other',
      });

      await expect(
        service.approveSection(
          'user-1',
          'project-1',
          'resource-1',
          'section-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws not found when the resource belongs to a different project', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resourceSection.findUnique.mockResolvedValue(proposedSection);
      prisma.resource.findUnique.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-other',
      });

      await expect(
        service.approveSection(
          'user-1',
          'project-1',
          'resource-1',
          'section-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws not found when the section does not exist', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resourceSection.findUnique.mockResolvedValue(null);

      await expect(
        service.approveSection(
          'user-1',
          'project-1',
          'resource-1',
          'section-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws not found for a client-role member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(clientMembership);

      await expect(
        service.approveSection(
          'user-1',
          'project-1',
          'resource-1',
          'section-1',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.resourceSection.update).not.toHaveBeenCalled();
    });
  });
});
