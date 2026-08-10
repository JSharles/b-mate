import { BadRequestException, NotFoundException } from '@nestjs/common';
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
import { CategoryReferenceService } from './category-reference.service';
import { ReferenceAnalysisClient } from './reference-analysis.client';
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
  let referenceAnalysisClient: jest.Mocked<
    Pick<ReferenceAnalysisClient, 'submitIngestion'>
  >;
  let imageNormalizer: jest.Mocked<Pick<ImageNormalizer, 'normalize'>>;
  let notionClient: jest.Mocked<Pick<NotionClient, 'fetchPage'>>;
  let notionConnectionService: jest.Mocked<
    Pick<NotionConnectionService, 'getDecryptedToken'>
  >;
  let categoryReferenceService: jest.Mocked<
    Pick<CategoryReferenceService, 'rebuild'>
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
    referenceAnalysisClient = { submitIngestion: jest.fn() };
    imageNormalizer = { normalize: jest.fn() };
    notionClient = { fetchPage: jest.fn() };
    notionConnectionService = { getDecryptedToken: jest.fn() };
    categoryReferenceService = { rebuild: jest.fn() };
    prisma.categoryReference.findMany.mockResolvedValue([]);
    prisma.categoryExtract.findMany.mockResolvedValue([]);
    service = new ResourcesService(
      asPrismaService(prisma),
      storageClient as unknown as ResourceStorageClient,
      referenceAnalysisClient as unknown as ReferenceAnalysisClient,
      imageNormalizer as unknown as ImageNormalizer,
      notionClient as unknown as NotionClient,
      notionConnectionService as unknown as NotionConnectionService,
      categoryReferenceService as unknown as CategoryReferenceService,
    );
  });

  afterAll(() => {
    process.env.BOARD_CONNECTION_ENCRYPTION_KEY = ORIGINAL_ENV;
  });

  describe('createFromUpload', () => {
    it('uploads the file, creates the resource, and submits a batch job', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      referenceAnalysisClient.submitIngestion.mockResolvedValue('batch_123');
      prisma.resource.create.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        source: 'upload',
        status: 'pending',
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
      expect(referenceAnalysisClient.submitIngestion).toHaveBeenCalledWith(
        { kind: 'pdf', fileBuffer: pdfFile.buffer },
        'Architecture overview',
        {},
      );
      expect(prisma.resource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: 'project-1',
            source: 'upload',
            status: 'pending',
            title: 'Architecture overview',
            addedByUserId: 'user-1',
            anthropicBatchId: 'batch_123',
            originalFileMimeType: 'application/pdf',
            originalFileName: 'Architecture overview.pdf',
          }) as unknown,
        }),
      );
      expect(result.status).toBe('pending');
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
      expect(referenceAnalysisClient.submitIngestion).not.toHaveBeenCalled();
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
      referenceAnalysisClient.submitIngestion.mockResolvedValue('batch_123');
      prisma.resource.create.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        source: 'upload',
        status: 'pending',
        title: 'MDW_SPORTS-ARCHITECTURE-2',
      });

      await service.createFromUpload('user-1', 'project-1', pngFile);

      expect(imageNormalizer.normalize).toHaveBeenCalledWith(
        pngFile.buffer,
        'image/png',
      );
      // Analysis gets the normalized copy...
      expect(referenceAnalysisClient.submitIngestion).toHaveBeenCalledWith(
        { kind: 'image', fileBuffer: normalizedBuffer, mimeType: 'image/png' },
        'MDW_SPORTS-ARCHITECTURE-2',
        {},
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
      referenceAnalysisClient.submitIngestion.mockResolvedValue('batch_123');
      prisma.resource.create.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        source: 'upload',
        status: 'pending',
        title: 'MDW_SPORTS-ARCHITECTURE-2',
      });

      await service.createFromUpload('user-1', 'project-1', pngFile);

      expect(referenceAnalysisClient.submitIngestion).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: 'image/jpeg' }),
        expect.any(String),
        {},
      );
    });

    it('never normalizes a non-image format', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      referenceAnalysisClient.submitIngestion.mockResolvedValue('batch_123');
      prisma.resource.create.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        source: 'upload',
        status: 'pending',
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
      expect(referenceAnalysisClient.submitIngestion).not.toHaveBeenCalled();
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
      referenceAnalysisClient.submitIngestion.mockResolvedValue('batch_123');
      prisma.resource.create.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        source: 'notion',
        status: 'pending',
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
      expect(referenceAnalysisClient.submitIngestion).toHaveBeenCalledWith(
        { kind: 'text', text: 'This system does X.' },
        'Architecture overview',
        {},
      );
      expect(prisma.resource.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            projectId: 'project-1',
            source: 'notion',
            status: 'pending',
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
        status: 'pending',
        title: 'A',
        createdAt: new Date('2026-08-08T00:00:00.000Z'),
      },
      {
        id: 'r2',
        projectId: 'project-1',
        source: 'upload',
        status: 'absorbed',
        title: 'B',
        createdAt: new Date('2026-08-08T00:00:00.000Z'),
      },
    ];

    it('returns every resource for a contributor', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findMany.mockResolvedValue(resources);

      const result = await service.findAllForProject('user-1', 'project-1');

      expect(prisma.resource.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId: 'project-1' } }),
      );
      expect(result).toHaveLength(2);
    });

    // specs/015 Q3/FR-019a: documents are inputs. A client reads category
    // content, never a document — so this list is contributor-only, and a
    // client gets the response a non-member gets (Constitution V).
    it('throws not found for a client-role member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(clientMembership);

      await expect(
        service.findAllForProject('user-1', 'project-1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.resource.findMany).not.toHaveBeenCalled();
    });

    it('throws not found for a non-member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.findAllForProject('user-1', 'project-1'),
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
      createdAt: new Date('2026-08-08T00:00:00.000Z'),
    };

    it('attaches a presigned originalFileUrl for a published, upload-sourced resource', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue(uploadResource);
      storageClient.getPresignedDownloadUrl.mockResolvedValue(
        'https://r2.example.com/signed',
      );

      const result = await service.findOne('user-1', 'project-1', 'resource-1');

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

      const result = await service.findOne('user-1', 'project-1', 'resource-1');

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
        service.findOne('user-1', 'project-1', 'resource-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws not found when the resource does not exist', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne('user-1', 'project-1', 'resource-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws not found when the resource belongs to a different project', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue({
        ...uploadResource,
        projectId: 'other-project',
      });

      await expect(
        service.findOne('user-1', 'project-1', 'resource-1'),
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

    // FR-019, the point of storing extracts per (document, category) at all:
    // merged prose cannot be un-mixed, so removal works by rebuilding from
    // the extracts that survive — exactly the ingestion path run backwards.
    it('rebuilds every category the document fed, and only those', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        source: 'upload',
        originalFileKey: 'resources/project-1/a.pdf',
      });
      prisma.categoryExtract.findMany.mockResolvedValue([
        { categoryKey: 'overview' },
        { categoryKey: 'planning' },
      ]);

      await service.delete('user-1', 'project-1', 'resource-1');

      expect(categoryReferenceService.rebuild).toHaveBeenCalledTimes(2);
      expect(categoryReferenceService.rebuild).toHaveBeenCalledWith(
        'project-1',
        'overview',
        null,
        'document_removed',
      );
      expect(categoryReferenceService.rebuild).toHaveBeenCalledWith(
        'project-1',
        'planning',
        null,
        'document_removed',
      );
    });

    // The categories have to be read before the row goes: the cascade takes
    // the extracts with it, and after that there is no way to know what the
    // document fed.
    it('reads the fed categories before deleting the row', async () => {
      const order: string[] = [];
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        source: 'notion',
        originalFileKey: null,
      });
      prisma.categoryExtract.findMany.mockImplementation(() => {
        order.push('read-extracts');
        return Promise.resolve([{ categoryKey: 'overview' }]);
      });
      prisma.resource.delete.mockImplementation(() => {
        order.push('delete-resource');
        return Promise.resolve({});
      });

      await service.delete('user-1', 'project-1', 'resource-1');

      expect(order).toEqual(['read-extracts', 'delete-resource']);
    });

    // A document still waiting on its first analysis has fed nothing yet, so
    // there is nothing to rebuild — and no batch request worth spending.
    it('rebuilds nothing when the document was never absorbed', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(contributorMembership);
      prisma.resource.findUnique.mockResolvedValue({
        id: 'resource-1',
        projectId: 'project-1',
        source: 'upload',
        status: 'pending',
        originalFileKey: 'resources/project-1/a.pdf',
      });

      await service.delete('user-1', 'project-1', 'resource-1');

      expect(categoryReferenceService.rebuild).not.toHaveBeenCalled();
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
});
