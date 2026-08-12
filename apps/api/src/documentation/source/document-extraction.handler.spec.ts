import type { GenerationOperation, SourceDocument } from '@prisma/client';
import { GenerationHandlerRegistry } from '../../generation/generation-handler.registry';
import { GenerationPolicyService } from '../../generation/policy/generation-policy.service';
import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../../test/prisma-mock';
import { DocumentInputNormalizerService } from './document-input-normalizer.service';
import { DocumentStorageClient } from './document-storage.client';
import { DocumentExtractionHandler } from './document-extraction.handler';

const documentId = '00000000-0000-4000-8000-000000000001';
const projectId = '00000000-0000-4000-8000-000000000002';
const observationId = '00000000-0000-4000-8000-000000000003';
const operation = {
  id: '00000000-0000-4000-8000-000000000004',
  projectId,
  type: 'document_extraction',
  sourceDocumentId: documentId,
  policySnapshot: { version: 'extract-policy', routes: [] },
} as unknown as GenerationOperation;

const document = {
  id: documentId,
  projectId,
  kind: 'upload',
  status: 'received',
  version: 1,
  title: 'Architecture',
  originalFileName: 'architecture.pdf',
  originalMimeType: 'application/pdf',
  originalSizeBytes: 4,
  storedObjectKey: 'documentation/project/document/original.pdf',
  externalUrl: null,
  contentSha256: 'a'.repeat(64),
  addedByUserId: '00000000-0000-4000-8000-000000000005',
  incorporatedInRevisionId: null,
  removedInRevisionId: null,
  failureCode: null,
  removedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as SourceDocument;

const output = {
  promptVersion: 'document-extraction-v2',
  inputChunkCount: 0,
  observations: [
    {
      sequence: 0,
      kind: 'decision',
      originalExcerpt: 'Sessions serveur révocables.',
      normalizedContent: "L'authentification utilise des sessions révocables.",
      normalizedLanguage: 'fr',
      categories: ['how_it_works'],
      locator: {
        type: 'pdf_page',
        page: 2,
        excerpt: 'Sessions serveur révocables.',
      },
    },
  ],
  accounting: { outputObservationCount: 1, rejectedClaimCount: 0 },
};

describe('DocumentExtractionHandler', () => {
  let prisma: PrismaMock;
  let storage: jest.Mocked<Pick<DocumentStorageClient, 'get'>>;
  let normalizer: jest.Mocked<
    Pick<DocumentInputNormalizerService, 'normalizeUpload'>
  >;
  let policy: jest.Mocked<Pick<GenerationPolicyService, 'snapshotFor'>>;
  let registry: GenerationHandlerRegistry;
  let handler: DocumentExtractionHandler;

  beforeEach(() => {
    prisma = createPrismaMock();
    storage = { get: jest.fn().mockResolvedValue(Buffer.from('%PDF')) };
    normalizer = {
      normalizeUpload: jest.fn().mockResolvedValue({
        contentHash: 'a'.repeat(64),
        normalizedText: null,
        chunks: [],
        parts: [
          {
            kind: 'pdf',
            data: Buffer.from('%PDF'),
            mimeType: 'application/pdf',
          },
        ],
        sourceSegments: [],
      }),
    };
    policy = {
      snapshotFor: jest.fn().mockReturnValue({
        version: 'consolidate-policy',
        stage: 'source_consolidation',
        crossProviderFallbackEnabled: false,
        routes: [
          {
            provider: 'fake',
            model: 'fake',
            transport: 'batch',
            maxAttempts: 1,
            requestTimeoutMs: 30_000,
            remoteDeadlineMs: 120_000,
          },
        ],
      }),
    };
    registry = new GenerationHandlerRegistry();
    handler = new DocumentExtractionHandler(
      asPrismaService(prisma),
      storage as unknown as DocumentStorageClient,
      normalizer as unknown as DocumentInputNormalizerService,
      policy as unknown as GenerationPolicyService,
      registry,
    );
    handler.onModuleInit();
  });

  it('builds provider-neutral input only after claiming the current document state', async () => {
    prisma.sourceDocument.findFirst.mockResolvedValue(document);
    prisma.sourceDocument.updateMany.mockResolvedValue({ count: 1 });
    prisma.projectSource.findUnique.mockResolvedValue({
      workingLanguage: 'fr',
    });

    const request = await handler.buildRequest(operation);

    expect(prisma.sourceDocument.updateMany).toHaveBeenCalledWith({
      where: {
        id: documentId,
        projectId,
        version: 1,
        status: { in: ['received', 'retrying', 'extracting', 'failed'] },
      },
      data: { status: 'extracting', failureCode: null },
    });
    expect(storage.get).toHaveBeenCalledWith(document.storedObjectKey);
    expect(request).toMatchObject({
      outputContract: 'diaphane.document-extraction.v2',
      outputSchema: expect.any(Object),
    });
  });

  it('persists attributable observations and chains consolidation once', async () => {
    prisma.sourceDocument.updateMany.mockResolvedValue({ count: 1 });
    prisma.projectSource.upsert.mockResolvedValue({
      id: 'source-1',
      currentRevisionId: null,
    });
    prisma.documentObservation.create.mockResolvedValue({ id: observationId });
    prisma.generationOperation.upsert.mockResolvedValue({
      id: 'consolidation-1',
    });

    await handler.apply(prisma as never, operation, { output });

    expect(prisma.documentObservation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceDocumentId: documentId,
        sequence: 0,
        locator: output.observations[0].locator,
        categories: { create: [{ categoryKey: 'how_it_works' }] },
      }),
    });
    expect(prisma.generationOperation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          type: 'source_consolidation',
          sourceDocumentId: documentId,
          baseSourceRevisionId: null,
        }),
      }),
    );
  });

  it('ignores a late result when removal or another state transition won the guard', async () => {
    prisma.sourceDocument.updateMany.mockResolvedValue({ count: 0 });

    await handler.apply(prisma as never, operation, { output });

    expect(prisma.documentObservation.create).not.toHaveBeenCalled();
    expect(prisma.generationOperation.upsert).not.toHaveBeenCalled();
  });

  it('marks the document failed when extraction exhausts its routes', async () => {
    await handler.onTerminalFailure(
      prisma as never,
      operation,
      'ANTHROPIC_INVALID_REQUEST',
    );

    expect(prisma.sourceDocument.updateMany).toHaveBeenCalledWith({
      where: {
        id: documentId,
        projectId,
        status: { in: ['received', 'extracting', 'retrying'] },
      },
      data: {
        status: 'failed',
        failureCode: 'ANTHROPIC_INVALID_REQUEST',
      },
    });
  });
});
