import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { SourceDocument } from '@prisma/client';
import { NotionConnectionService } from '../../notion-connection/notion-connection.service';
import {
  NotionAccessError,
  NotionClient,
} from '../../notion-connection/notion.client';
import { ProjectAccessService } from '../../projects/project-access.service';
import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../../test/prisma-mock';
import { GenerationService } from '../../generation/generation.service';
import { DocumentStorageClient } from './document-storage.client';
import {
  parseNotionPageId,
  SourceDocumentService,
} from './source-document.service';

const projectId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const documentId = '00000000-0000-4000-8000-000000000003';
const operationId = '00000000-0000-4000-8000-000000000004';

function sourceDocument(
  overrides: Partial<SourceDocument> = {},
): SourceDocument {
  return {
    id: documentId,
    projectId,
    kind: 'upload',
    status: 'received',
    version: 1,
    title: 'Architecture',
    originalFileName: 'architecture.pdf',
    originalMimeType: 'application/pdf',
    originalSizeBytes: 13,
    storedObjectKey: `documentation/${projectId}/${documentId}/architecture.pdf`,
    externalUrl: null,
    contentSha256: 'a'.repeat(64),
    addedByUserId: userId,
    incorporatedInRevisionId: null,
    removedInRevisionId: null,
    failureCode: null,
    removedAt: null,
    createdAt: new Date('2026-08-11T10:00:00.000Z'),
    updatedAt: new Date('2026-08-11T10:00:00.000Z'),
    ...overrides,
  };
}

describe('SourceDocumentService', () => {
  let prisma: PrismaMock;
  let storage: jest.Mocked<DocumentStorageClient>;
  let generation: jest.Mocked<
    Pick<GenerationService, 'create' | 'retry' | 'cancel'>
  >;
  let access: jest.Mocked<Pick<ProjectAccessService, 'requireContributor'>>;
  let notionClient: jest.Mocked<Pick<NotionClient, 'fetchPage'>>;
  let notionConnection: jest.Mocked<
    Pick<NotionConnectionService, 'getDecryptedToken'>
  >;
  let service: SourceDocumentService;

  beforeEach(() => {
    prisma = createPrismaMock();
    storage = {
      put: jest.fn(),
      delete: jest.fn(),
      getDownloadUrl: jest.fn(),
    } as unknown as jest.Mocked<DocumentStorageClient>;
    generation = { create: jest.fn(), retry: jest.fn(), cancel: jest.fn() };
    access = { requireContributor: jest.fn().mockResolvedValue({}) };
    notionClient = { fetchPage: jest.fn() };
    notionConnection = { getDecryptedToken: jest.fn() };
    service = new SourceDocumentService(
      asPrismaService(prisma),
      storage,
      generation as unknown as GenerationService,
      access as unknown as ProjectAccessService,
      notionClient as unknown as NotionClient,
      notionConnection as unknown as NotionConnectionService,
    );
    prisma.sourceDocument.create.mockResolvedValue(sourceDocument());
    generation.create.mockResolvedValue({
      id: operationId,
      status: 'queued',
    } as never);
  });

  it('validates supported MIME types and the 25 MB limit before storage', async () => {
    await expect(
      service.addUpload(userId, projectId, {
        buffer: Buffer.from('x'),
        originalname: 'malware.exe',
        mimetype: 'application/octet-stream',
        size: 1,
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.addUpload(userId, projectId, {
        buffer: Buffer.alloc(1),
        originalname: 'large.pdf',
        mimetype: 'application/pdf',
        size: 25 * 1024 * 1024 + 1,
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('rejects empty content and a buffer that exceeds the limit independently of metadata', async () => {
    await expect(
      service.addUpload(userId, projectId, {
        buffer: Buffer.alloc(0),
        originalname: 'empty.pdf',
        mimetype: 'application/pdf',
        size: 0,
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.addUpload(userId, projectId, {
        buffer: Buffer.alloc(25 * 1024 * 1024 + 1),
        originalname: 'large.pdf',
        mimetype: 'application/pdf',
        size: 1,
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('preserves the original and immediately acknowledges document and operation', async () => {
    const original = Buffer.from('%PDF-original');
    const result = await service.addUpload(userId, projectId, {
      buffer: original,
      originalname: 'architecture.pdf',
      mimetype: 'application/pdf',
      size: original.length,
    } as Express.Multer.File);

    expect(storage.put).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(
          `^documentation/${projectId}/[0-9a-f-]+/architecture\\.pdf$`,
        ),
      ),
      original,
      'application/pdf',
    );
    expect(generation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        type: 'document_extraction',
        sourceDocumentId: documentId,
        inputFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
    expect(result).toMatchObject({
      document: { id: documentId, status: 'received' },
      operation: { operationId, status: 'queued' },
    });
  });

  it('compensates R2 and the document row when acknowledgement setup fails', async () => {
    generation.create.mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.addUpload(userId, projectId, {
        buffer: Buffer.from('%PDF'),
        originalname: 'a.pdf',
        mimetype: 'application/pdf',
        size: 4,
      } as Express.Multer.File),
    ).rejects.toThrow('database unavailable');

    expect(prisma.sourceDocument.deleteMany).toHaveBeenCalledWith({
      where: { id: documentId, status: 'received' },
    });
    expect(storage.delete).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^documentation/${projectId}/`)),
    );
  });

  it('compensates storage without deleting a row when database creation fails', async () => {
    prisma.sourceDocument.create.mockRejectedValue(new Error('insert failed'));
    await expect(
      service.addUpload(userId, projectId, {
        buffer: Buffer.from('%PDF'),
        originalname: '.pdf',
        mimetype: 'application/pdf',
        size: 4,
      } as Express.Multer.File),
    ).rejects.toThrow('insert failed');
    expect(prisma.sourceDocument.deleteMany).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalled();
  });

  it('fails before queuing when the immutable hash is missing or the operation is inactive', async () => {
    prisma.sourceDocument.create.mockResolvedValueOnce(
      sourceDocument({ contentSha256: null }),
    );
    await expect(
      service.addUpload(userId, projectId, {
        buffer: Buffer.from('%PDF'),
        originalname: '.pdf',
        mimetype: 'application/pdf',
        size: 4,
      } as Express.Multer.File),
    ).rejects.toThrow('without a hash');

    prisma.sourceDocument.create.mockResolvedValueOnce(sourceDocument());
    generation.create.mockResolvedValueOnce({
      id: operationId,
      status: 'completed',
    } as never);
    await expect(
      service.addUpload(userId, projectId, {
        buffer: Buffer.from('%PDF'),
        originalname: '.pdf',
        mimetype: 'application/pdf',
        size: 4,
      } as Express.Multer.File),
    ).rejects.toThrow('active operation');
  });

  it('stores an immutable Notion snapshot instead of a live page reference only', async () => {
    notionConnection.getDecryptedToken.mockResolvedValue('secret-token');
    notionClient.fetchPage.mockResolvedValue({
      title: 'Cadrage',
      content: 'Le lancement est en avril.',
    });
    prisma.sourceDocument.create.mockResolvedValue(
      sourceDocument({
        kind: 'notion',
        title: 'Cadrage',
        originalFileName: null,
        originalMimeType: 'application/json',
        externalUrl:
          'https://notion.so/Cadrage-0123456789abcdef0123456789abcdef',
      }),
    );

    const result = await service.addNotion(
      userId,
      projectId,
      'https://notion.so/Cadrage-0123456789abcdef0123456789abcdef',
    );

    expect(storage.put).toHaveBeenCalledWith(
      expect.stringContaining('/notion-snapshot.json'),
      expect.any(Buffer),
      'application/json',
    );
    const snapshot = JSON.parse(
      (storage.put.mock.calls[0]?.[1]).toString('utf8'),
    );
    expect(snapshot).toMatchObject({
      pageId: '0123456789abcdef0123456789abcdef',
      title: 'Cadrage',
      content: 'Le lancement est en avril.',
    });
    expect(result.document.kind).toBe('notion');
  });

  it('rejects invalid, disconnected, and inaccessible Notion pages', async () => {
    await expect(
      service.addNotion(userId, projectId, 'https://example.com/page'),
    ).rejects.toBeInstanceOf(BadRequestException);

    notionConnection.getDecryptedToken.mockResolvedValueOnce(null);
    await expect(
      service.addNotion(
        userId,
        projectId,
        'https://notion.so/Page-0123456789abcdef0123456789abcdef',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    notionConnection.getDecryptedToken.mockResolvedValue('token');
    notionClient.fetchPage.mockRejectedValueOnce(
      new NotionAccessError('forbidden'),
    );
    await expect(
      service.addNotion(
        userId,
        projectId,
        'https://notion.so/Page-0123456789abcdef0123456789abcdef',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    notionClient.fetchPage.mockRejectedValueOnce(new Error('network'));
    await expect(
      service.addNotion(
        userId,
        projectId,
        'https://notion.so/Page-0123456789abcdef0123456789abcdef',
      ),
    ).rejects.toThrow('network');
  });

  it('returns contributor-only list/detail state and a fresh short-lived original URL', async () => {
    prisma.sourceDocument.findMany.mockResolvedValue([sourceDocument()]);
    prisma.sourceDocument.count.mockResolvedValue(1);
    prisma.sourceDocument.findFirst.mockResolvedValue(sourceDocument());
    storage.getDownloadUrl.mockResolvedValue('https://signed.example/file');

    await expect(service.list(userId, projectId)).resolves.toEqual({
      items: [expect.objectContaining({ id: documentId, status: 'received' })],
      total: 1,
      nextCursor: null,
    });
    expect(prisma.sourceDocument.count).toHaveBeenCalledWith({
      where: { projectId, status: { not: 'removed' } },
    });
    expect(prisma.sourceDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId, status: { not: 'removed' } },
      }),
    );
    await expect(
      service.detail(userId, projectId, documentId),
    ).resolves.toEqual(
      expect.objectContaining({
        id: documentId,
        originalDownloadUrl: 'https://signed.example/file',
      }),
    );
    expect(access.requireContributor).toHaveBeenCalledTimes(2);
    expect(storage.getDownloadUrl).toHaveBeenCalledWith(
      expect.any(String),
      900,
    );
  });

  it('paginates deterministically and never signs a removed original', async () => {
    const documents = Array.from({ length: 51 }, (_, index) =>
      sourceDocument({ id: `document-${index}`, title: `Document ${index}` }),
    );
    prisma.sourceDocument.findMany.mockResolvedValue(documents);
    prisma.sourceDocument.count.mockResolvedValue(51);
    const page = await service.list(userId, projectId, 'cursor-1');
    expect(page.items).toHaveLength(50);
    expect(page.nextCursor).toBe('document-49');
    expect(prisma.sourceDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: 'cursor-1' }, skip: 1 }),
    );

    prisma.sourceDocument.findFirst.mockResolvedValue({
      ...sourceDocument({ status: 'removed', storedObjectKey: null }),
      observations: [
        {
          categories: [
            { categoryKey: 'planning' },
            { categoryKey: 'overview' },
            { categoryKey: 'planning' },
          ],
        },
      ],
    });
    await expect(
      service.detail(userId, projectId, documentId),
    ).resolves.toMatchObject({
      originalDownloadUrl: null,
      affectedCategories: ['overview', 'planning'],
    });
    expect(storage.getDownloadUrl).not.toHaveBeenCalled();
  });

  it('uses the same hidden 404 for a missing document after authorization', async () => {
    prisma.sourceDocument.findFirst.mockResolvedValue(null);

    await expect(service.detail(userId, projectId, documentId)).rejects.toEqual(
      new NotFoundException({ code: 'NOT_FOUND' }),
    );
  });

  it('queues a fresh extraction attempt and exposes retrying state for a failed document', async () => {
    prisma.sourceDocument.findFirst.mockResolvedValue({
      ...sourceDocument({ status: 'failed', failureCode: 'PROVIDER_DOWN' }),
      generationOperations: [{ id: operationId, type: 'document_extraction' }],
    });
    generation.retry.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000005',
      status: 'queued',
    } as never);
    prisma.sourceDocument.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.retryProcessing(userId, projectId, documentId),
    ).resolves.toEqual({
      operationId: '00000000-0000-4000-8000-000000000005',
      status: 'queued',
    });
    expect(generation.retry).toHaveBeenCalledWith(operationId);
    expect(prisma.sourceDocument.updateMany).toHaveBeenCalledWith({
      where: { id: documentId, projectId, status: 'failed' },
      data: {
        status: 'retrying',
        failureCode: null,
        version: { increment: 1 },
      },
    });
  });

  // A document being worked on offered no action at all: a spinner, for a batch
  // stage that runs minutes and can hang for hours. Stopping halts the remote
  // work and parks the document where the removal and retry paths can reach it.
  it('stops the remote work before releasing a document being processed', async () => {
    prisma.sourceDocument.findFirst.mockResolvedValue({
      ...sourceDocument({ status: 'extracting' }),
      generationOperations: [{ id: operationId }, { id: 'operation-2' }],
    });
    generation.cancel.mockResolvedValue({
      cancelled: true,
      remoteAccepted: true,
    });
    prisma.sourceDocument.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.cancelProcessing(userId, projectId, documentId),
    ).resolves.toEqual({ cancelledOperationCount: 2 });

    expect(generation.cancel).toHaveBeenCalledTimes(2);
    // The order matters: released first, an in-flight result could still land
    // and drag the document back into the pipeline just walked away from.
    expect(generation.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.sourceDocument.updateMany.mock.invocationCallOrder[0],
    );
    expect(prisma.sourceDocument.updateMany).toHaveBeenCalledWith({
      where: { id: documentId, projectId, version: 1 },
      data: {
        status: 'failed',
        failureCode: 'CANCELLED_BY_CONTRIBUTOR',
        version: { increment: 1 },
      },
    });
  });

  it('refuses to stop a document that is not being processed', async () => {
    prisma.sourceDocument.findFirst.mockResolvedValue(null);

    await expect(
      service.cancelProcessing(userId, projectId, documentId),
    ).rejects.toEqual(new NotFoundException({ code: 'NOT_FOUND' }));
    expect(generation.cancel).not.toHaveBeenCalled();
  });

  // Restricted to extraction, retry restarted a stage that had already
  // succeeded when it was the consolidation that stopped — and resolved to the
  // finished operation, leaving the document "retrying" with no work behind it.
  it('restarts whichever stage stopped, not always the first one', async () => {
    prisma.sourceDocument.findFirst.mockResolvedValue({
      ...sourceDocument({ status: 'failed' }),
      generationOperations: [
        { id: 'consolidation-1', type: 'source_consolidation' },
      ],
    });
    generation.retry.mockResolvedValue({
      id: 'consolidation-2',
      status: 'queued',
    } as never);
    prisma.sourceDocument.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.retryProcessing(userId, projectId, documentId),
    ).resolves.toEqual({ operationId: 'consolidation-2', status: 'queued' });

    // And it has to stand where that stage will pick it up. Every restart set
    // `retrying`, which only extraction accepts, so a restarted consolidation
    // was refused by its own handler and failed on the spot.
    expect(prisma.sourceDocument.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ready_to_consolidate' }),
      }),
    );

    expect(prisma.sourceDocument.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          generationOperations: expect.objectContaining({
            where: { status: { in: ['needs_attention', 'cancelled'] } },
          }),
        },
      }),
    );
  });

  it('refuses to announce a restart that queued nothing', async () => {
    prisma.sourceDocument.findFirst.mockResolvedValue({
      ...sourceDocument({ status: 'failed' }),
      generationOperations: [{ id: operationId }],
    });
    // Deduplication can hand back the operation that already ran to completion.
    generation.retry.mockResolvedValue({
      id: operationId,
      status: 'succeeded',
    } as never);

    await expect(
      service.retryProcessing(userId, projectId, documentId),
    ).rejects.toEqual(new NotFoundException({ code: 'NOT_FOUND' }));
    expect(prisma.sourceDocument.updateMany).not.toHaveBeenCalled();
  });

  it('does not retry a document without a terminal extraction operation', async () => {
    prisma.sourceDocument.findFirst.mockResolvedValue({
      ...sourceDocument({ status: 'failed' }),
      generationOperations: [],
    });

    await expect(
      service.retryProcessing(userId, projectId, documentId),
    ).rejects.toEqual(new NotFoundException({ code: 'NOT_FOUND' }));
    expect(generation.retry).not.toHaveBeenCalled();
  });

  it('extracts Notion identifiers only from valid Notion URLs', () => {
    expect(
      parseNotionPageId(
        'https://www.notion.so/Workspace/Page-0123456789abcdef0123456789abcdef',
      ),
    ).toBe('0123456789abcdef0123456789abcdef');
    expect(
      parseNotionPageId(
        'https://app.notion.com/p/Product-MD-0123456789abcdef0123456789abcdef?source=copy_link',
      ),
    ).toBe('0123456789abcdef0123456789abcdef');
    expect(parseNotionPageId('not a URL')).toBeNull();
    expect(parseNotionPageId('https://notion.so/no-id')).toBeNull();
    expect(
      parseNotionPageId(
        'http://app.notion.com/p/0123456789abcdef0123456789abcdef',
      ),
    ).toBeNull();
    expect(
      parseNotionPageId(
        'https://evil-notion.so/0123456789abcdef0123456789abcdef',
      ),
    ).toBeNull();
    expect(
      parseNotionPageId(
        'https://notion.com.evil.example/0123456789abcdef0123456789abcdef',
      ),
    ).toBeNull();
  });
});
