import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
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
import { DocumentInputNormalizerService } from './document-input-normalizer.service';
import { ReferenceDocumentService } from '../reference/reference-document.service';
import { DocumentStorageClient } from './document-storage.client';
import {
  parseNotionPageId,
  SourceDocumentService,
} from './source-document.service';

const projectId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const documentId = '00000000-0000-4000-8000-000000000003';

function sourceDocument(
  overrides: Partial<SourceDocument> = {},
): SourceDocument {
  return {
    id: documentId,
    projectId,
    kind: 'upload',
    status: 'incorporated',
    version: 1,
    title: 'Architecture',
    originalFileName: 'architecture.pdf',
    originalMimeType: 'application/pdf',
    originalSizeBytes: 13,
    storedObjectKey: `documentation/${projectId}/${documentId}/architecture.pdf`,
    externalUrl: null,
    contentSha256: 'a'.repeat(64),
    addedByUserId: userId,
    failureCode: null,
    processingStartedAt: null,
    removedAt: null,
    createdAt: new Date('2026-08-11T10:00:00.000Z'),
    updatedAt: new Date('2026-08-11T10:00:00.000Z'),
    ...overrides,
  };
}

describe('SourceDocumentService', () => {
  let prisma: PrismaMock;
  let storage: jest.Mocked<DocumentStorageClient>;
  let normalizer: jest.Mocked<
    Pick<DocumentInputNormalizerService, 'normalizeUpload'>
  >;
  let access: jest.Mocked<Pick<ProjectAccessService, 'requireContributor'>>;
  let notionClient: jest.Mocked<Pick<NotionClient, 'fetchPage'>>;
  let notionConnection: jest.Mocked<
    Pick<NotionConnectionService, 'getDecryptedToken'>
  >;
  let reference: jest.Mocked<Pick<ReferenceDocumentService, 'write'>>;
  let service: SourceDocumentService;

  beforeEach(() => {
    prisma = createPrismaMock();
    storage = {
      put: jest.fn(),
      delete: jest.fn(),
      getDownloadUrl: jest.fn(),
    } as unknown as jest.Mocked<DocumentStorageClient>;
    normalizer = {
      normalizeUpload: jest.fn().mockResolvedValue({ parts: [] }),
    };
    access = { requireContributor: jest.fn().mockResolvedValue({}) };
    notionClient = { fetchPage: jest.fn() };
    notionConnection = { getDecryptedToken: jest.fn() };
    reference = { write: jest.fn().mockResolvedValue({ documentId: 'ref-1' }) };
    service = new SourceDocumentService(
      asPrismaService(prisma),
      storage,
      normalizer as unknown as DocumentInputNormalizerService,
      access as unknown as ProjectAccessService,
      notionClient as unknown as NotionClient,
      notionConnection as unknown as NotionConnectionService,
      reference as unknown as ReferenceDocumentService,
    );
    prisma.sourceDocument.create.mockResolvedValue(sourceDocument());
    prisma.project.update.mockResolvedValue({ id: projectId });
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

  it('preserves the original and takes the document into the corpus at once', async () => {
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
    expect(result).toMatchObject({
      document: { id: documentId, status: 'incorporated' },
    });
  });

  // A document is added to be read, so adding one writes the reference
  // document: the developer does not have to ask for what they just asked for.
  it('writes the reference document from the document just added', async () => {
    await service.addUpload(
      userId,
      projectId,
      {
        buffer: Buffer.from('%PDF'),
        originalname: 'a.pdf',
        mimetype: 'application/pdf',
        size: 4,
      } as Express.Multer.File,
      'fr',
    );

    expect(prisma.project.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { referenceNeedsRewrite: true } }),
    );
    expect(reference.write).toHaveBeenCalledWith(userId, projectId, 'fr');
  });

  // A write already running has this document's arrival behind it, and one
  // still being read is not a reason to refuse the upload.
  it('keeps the document when a write is already running', async () => {
    reference.write.mockRejectedValue(
      new ConflictException({ code: 'REFERENCE_WRITING' }),
    );

    await expect(
      service.addUpload(userId, projectId, {
        buffer: Buffer.from('%PDF'),
        originalname: 'a.pdf',
        mimetype: 'application/pdf',
        size: 4,
      } as Express.Multer.File),
    ).resolves.toMatchObject({ document: { id: documentId } });
    expect(prisma.sourceDocument.deleteMany).not.toHaveBeenCalled();
  });

  // Read once, at the door. An unreadable file that got in would fail the whole
  // reference write later and take the project's document down with it.
  it('refuses a file it cannot read, before storing anything', async () => {
    normalizer.normalizeUpload.mockRejectedValue(new Error('corrupt pdf'));

    await expect(
      service.addUpload(userId, projectId, {
        buffer: Buffer.from('not really a pdf'),
        originalname: 'broken.pdf',
        mimetype: 'application/pdf',
        size: 16,
      } as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.put).not.toHaveBeenCalled();
    expect(prisma.sourceDocument.create).not.toHaveBeenCalled();
  });

  it('compensates R2 and the document row when the row cannot be finished', async () => {
    prisma.project.update.mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.addUpload(userId, projectId, {
        buffer: Buffer.from('%PDF'),
        originalname: 'a.pdf',
        mimetype: 'application/pdf',
        size: 4,
      } as Express.Multer.File),
    ).rejects.toThrow('database unavailable');

    expect(prisma.sourceDocument.deleteMany).toHaveBeenCalledWith({
      where: { id: documentId },
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
      items: [
        expect.objectContaining({ id: documentId, status: 'incorporated' }),
      ],
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
      observations: [{}],
    });
    await expect(
      service.detail(userId, projectId, documentId),
    ).resolves.toMatchObject({
      originalDownloadUrl: null,
    });
    expect(storage.getDownloadUrl).not.toHaveBeenCalled();
  });

  it('uses the same hidden 404 for a missing document after authorization', async () => {
    prisma.sourceDocument.findFirst.mockResolvedValue(null);

    await expect(service.detail(userId, projectId, documentId)).rejects.toEqual(
      new NotFoundException({ code: 'NOT_FOUND' }),
    );
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
