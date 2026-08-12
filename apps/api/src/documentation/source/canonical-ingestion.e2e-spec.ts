import type { GenerationOperation, SourceDocument } from '@prisma/client';
import { GenerationHandlerRegistry } from '../../generation/generation-handler.registry';
import { GenerationPolicyService } from '../../generation/policy/generation-policy.service';
import { GenerationService } from '../../generation/generation.service';
import { NotionConnectionService } from '../../notion-connection/notion-connection.service';
import { NotionClient } from '../../notion-connection/notion.client';
import { ProjectAccessService } from '../../projects/project-access.service';
import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { DocumentInputNormalizerService } from './document-input-normalizer.service';
import { DocumentExtractionHandler } from './document-extraction.handler';
import { DocumentStorageClient } from './document-storage.client';
import { SourceConsolidationHandler } from './source-consolidation.handler';
import { SourceDocumentService } from './source-document.service';
import {
  buildConsolidationPlan,
  ConsolidationDisposition,
  CurrentCanonicalItem,
  SourceRevisionService,
} from './source-revision.service';

const projectId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const projectSourceId = '00000000-0000-4000-8000-000000000003';

function uuid(sequence: number) {
  return `00000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;
}

describe('canonical document ingestion (mocked service chain)', () => {
  it('acknowledges three overlapping multilingual documents, consolidates one source, and exposes complete provenance', async () => {
    const prisma = createPrismaMock();
    const documents = new Map<string, SourceDocument>();
    const observations = new Map<
      string,
      {
        id: string;
        sourceDocumentId: string;
        kind: CurrentCanonicalItem['kind'];
        normalizedContent: string;
        exactContentHash: string;
        sourceLanguage: string;
        originalExcerpt: string;
        locator: unknown;
        categories: Array<{
          categoryKey: 'overview' | 'how_it_works' | 'planning' | 'other';
        }>;
      }
    >();
    const extractionOperations: GenerationOperation[] = [];
    const consolidationOperations: GenerationOperation[] = [];
    const revisions: Array<{
      id: string;
      sequence: number;
      trigger: 'document_added';
      summary: string;
      createdAt: Date;
      impacts: Array<{
        categoryKey: 'overview' | 'how_it_works' | 'planning' | 'other';
      }>;
    }> = [];
    const history: Array<{
      informationItemId: string;
      kind: string;
      sourceRevisionId: string;
      sourceRevision: { sequence: number; createdAt: Date };
    }> = [];
    let canonicalItems: CurrentCanonicalItem[] = [];
    let currentRevisionId: string | null = null;
    let observationSequence = 100;
    let itemSequence = 200;

    const access = {
      requireContributor: jest.fn().mockResolvedValue({}),
    } as unknown as ProjectAccessService;
    const stored = new Map<string, Buffer>();
    const storage = {
      put: jest.fn(async (key: string, bytes: Buffer) => {
        stored.set(key, bytes);
      }),
      delete: jest.fn(),
      getDownloadUrl: jest.fn(),
      get: jest.fn(async (key: string) => stored.get(key) ?? Buffer.alloc(0)),
    } as unknown as DocumentStorageClient;

    prisma.sourceDocument.create.mockImplementation(({ data }) => {
      const now = new Date('2026-08-11T10:00:00.000Z');
      const document = {
        version: 1,
        failureCode: null,
        incorporatedInRevisionId: null,
        removedInRevisionId: null,
        removedAt: null,
        externalUrl: null,
        originalFileName: null,
        originalMimeType: null,
        originalSizeBytes: null,
        storedObjectKey: null,
        contentSha256: null,
        createdAt: now,
        updatedAt: now,
        ...data,
      } as SourceDocument;
      documents.set(document.id, document);
      return Promise.resolve(document);
    });
    prisma.sourceDocument.updateMany.mockImplementation(({ where, data }) => {
      const document = documents.get(where.id as string);
      if (!document) return Promise.resolve({ count: 0 });
      Object.assign(document, data);
      return Promise.resolve({ count: 1 });
    });
    prisma.project.findUnique.mockResolvedValue({ language: 'fr' });
    prisma.projectSource.upsert.mockImplementation(() =>
      Promise.resolve({
        id: projectSourceId,
        projectId,
        currentRevisionId,
      }),
    );
    prisma.documentObservation.create.mockImplementation(({ data }) => {
      const id = uuid(observationSequence++);
      const observation = {
        id,
        sourceDocumentId: data.sourceDocumentId,
        kind: data.kind,
        normalizedContent: data.normalizedContent,
        exactContentHash: data.exactContentHash,
        sourceLanguage: data.sourceLanguage,
        originalExcerpt: data.originalExcerpt,
        locator: data.locator,
        categories: data.categories.create,
      };
      observations.set(id, observation);
      return Promise.resolve(observation);
    });
    prisma.generationOperation.upsert.mockImplementation(({ create }) => {
      const operation = {
        id: uuid(300 + consolidationOperations.length),
        createdAt: new Date(),
        updatedAt: new Date(),
        currentRouteIndex: 0,
        currentAttemptId: null,
        runAfter: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        terminalCode: null,
        completedAt: null,
        ...create,
      } as GenerationOperation;
      consolidationOperations.push(operation);
      return Promise.resolve(operation);
    });

    const generation = {
      create: jest.fn(async (input) => {
        const operation = {
          id: uuid(10 + extractionOperations.length),
          status: 'queued',
          currentRouteIndex: 0,
          currentAttemptId: null,
          runAfter: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
          terminalCode: null,
          completedAt: null,
          policySnapshot: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          baseSourceRevisionId: null,
          sourceRevisionId: null,
          categoryReferenceId: null,
          profileProposalId: null,
          profileRevisionId: null,
          clientReleaseId: null,
          clientCategoryContentId: null,
          replacesOperationId: null,
          ...input,
        } as GenerationOperation;
        extractionOperations.push(operation);
        return operation;
      }),
    } as unknown as GenerationService;
    const sourceDocuments = new SourceDocumentService(
      asPrismaService(prisma),
      storage,
      generation,
      access,
      {} as NotionClient,
      {} as NotionConnectionService,
    );

    const files = [
      {
        name: 'brief-fr.pdf',
        type: 'application/pdf',
        body: 'Application mobile. Lancement le 12 septembre.',
      },
      {
        name: 'architecture-en.docx',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        body: 'Mobile application. Server sessions are revocable.',
      },
      {
        name: 'decision-fr.pdf',
        type: 'application/pdf',
        body: 'Le lancement est reporté au 19 septembre. Mode hors ligne requis.',
      },
    ];
    const acknowledgements: Awaited<
      ReturnType<SourceDocumentService['addUpload']>
    >[] = [];
    for (const file of files) {
      const buffer = Buffer.from(file.body);
      acknowledgements.push(
        await sourceDocuments.addUpload(userId, projectId, {
          buffer,
          originalname: file.name,
          mimetype: file.type,
          size: buffer.length,
        } as Express.Multer.File),
      );
    }

    expect(acknowledgements).toHaveLength(3);
    expect(
      acknowledgements.every(({ operation }) => operation.status === 'queued'),
    ).toBe(true);
    expect(storage.put).toHaveBeenCalledTimes(3);

    const policy = {
      snapshotFor: jest.fn().mockReturnValue({ version: 'test', routes: [] }),
    } as unknown as GenerationPolicyService;
    const extractionRegistry = new GenerationHandlerRegistry();
    const extraction = new DocumentExtractionHandler(
      asPrismaService(prisma),
      storage,
      {} as DocumentInputNormalizerService,
      policy,
      extractionRegistry,
    );
    extraction.onModuleInit();

    const normalized = [
      [
        [
          'fact',
          'Application mobile pour les équipes terrain.',
          'overview',
          'Application mobile',
        ],
        [
          'date',
          'Le lancement public est prévu le 12 septembre.',
          'planning',
          'Lancement le 12 septembre',
        ],
      ],
      [
        [
          'fact',
          'Application mobile pour les équipes terrain.',
          'overview',
          'Mobile application',
        ],
        [
          'decision',
          "L'authentification utilise des sessions serveur révocables.",
          'how_it_works',
          'Server sessions are revocable',
        ],
      ],
      [
        [
          'date',
          'Le lancement public est prévu le 19 septembre.',
          'planning',
          'Lancement reporté au 19 septembre',
        ],
        [
          'constraint',
          "L'application doit fonctionner hors ligne.",
          'overview',
          'Mode hors ligne requis',
        ],
      ],
    ] as const;

    for (const [index, operation] of extractionOperations.entries()) {
      const document = documents.get(operation.sourceDocumentId!)!;
      document.status = 'extracting';
      const facts = normalized[index];
      await extraction.apply(prisma as never, operation, {
        output: {
          promptVersion: 'document-extraction-v1',
          inputFingerprint: operation.inputFingerprint,
          inputChunkCount: 1,
          observations: facts.map(
            ([kind, content, category, excerpt], sequence) => ({
              sequence,
              kind,
              originalExcerpt: excerpt,
              normalizedContent: content,
              normalizedLanguage: 'fr',
              categories: [category],
              locator: { type: 'pdf_page', page: 1, excerpt },
            }),
          ),
          accounting: {
            outputObservationCount: facts.length,
            rejectedClaimCount: 0,
          },
        },
      });
    }

    expect(observations.size).toBe(6);
    expect(consolidationOperations).toHaveLength(3);

    const revisionWriter = {
      commitFromConsolidation: jest.fn(
        async (
          _tx: unknown,
          operation: GenerationOperation,
          dispositions: readonly ConsolidationDisposition[],
        ) => {
          const incoming = [...observations.values()]
            .filter(
              ({ sourceDocumentId }) =>
                sourceDocumentId === operation.sourceDocumentId,
            )
            .map((item) => ({
              id: item.id,
              kind: item.kind,
              normalizedContent: item.normalizedContent,
              exactContentHash: item.exactContentHash,
              sourceLanguage: item.sourceLanguage,
              categories: item.categories.map(({ categoryKey }) => categoryKey),
            }));
          const plan = buildConsolidationPlan(
            canonicalItems,
            incoming,
            dispositions,
          );
          const sequence = revisions.length + 1;
          const revisionId = uuid(400 + sequence);
          canonicalItems = plan.items.map((item, index) => ({
            revisionItemId: uuid(500 + sequence * 10 + index),
            informationItemId: item.informationItemId ?? uuid(itemSequence++),
            previousRevisionItemId: item.previousRevisionItemId,
            kind: item.kind,
            state: item.state,
            content: item.content,
            sortOrder: item.sortOrder,
            categories: item.categories,
            provenance: item.provenance,
          }));
          for (const change of plan.changes) {
            const cause = observations.get(change.causeObservationId)!;
            const matching = canonicalItems.find((item) =>
              item.provenance.some(
                ({ documentObservationId }) =>
                  documentObservationId === cause.id,
              ),
            )!;
            history.push({
              informationItemId:
                change.informationItemId ?? matching.informationItemId,
              kind: change.kind,
              sourceRevisionId: revisionId,
              sourceRevision: {
                sequence,
                createdAt: new Date(`2026-08-11T1${sequence}:00:00.000Z`),
              },
            });
          }
          revisions.push({
            id: revisionId,
            sequence,
            trigger: 'document_added',
            summary: `Document incorporated: ${documents.get(operation.sourceDocumentId!)!.title}`,
            createdAt: new Date(`2026-08-11T1${sequence}:00:00.000Z`),
            impacts: plan.impactedCategories.map((categoryKey) => ({
              categoryKey,
            })),
          });
          currentRevisionId = revisionId;
          return { status: 'committed' as const, revisionId };
        },
      ),
    } as unknown as SourceRevisionService;
    prisma.documentObservation.findMany.mockImplementation(({ where }) =>
      Promise.resolve(
        [...observations.values()]
          .filter(
            ({ sourceDocumentId }) =>
              sourceDocumentId === where.sourceDocumentId,
          )
          .map(({ id, sourceDocumentId }) => ({ id, sourceDocumentId })),
      ),
    );
    // The handler rebuilds the reference map from the same two queries the
    // request was built from, so the head has to be readable here too.
    prisma.projectSource.findUnique.mockImplementation(() =>
      Promise.resolve({
        id: projectSourceId,
        currentRevisionId,
        currentRevision: {
          items: [...canonicalItems].sort(
            (left, right) => left.sortOrder - right.sortOrder,
          ),
        },
      }),
    );
    const consolidation = new SourceConsolidationHandler(
      asPrismaService(prisma),
      revisionWriter,
      new GenerationHandlerRegistry(),
    );

    const itemRefFor = (content: string) => {
      const ordered = [...canonicalItems].sort(
        (left, right) => left.sortOrder - right.sortOrder,
      );
      return `i${ordered.findIndex((item) => item.content === content)}`;
    };
    for (const [index, operation] of consolidationOperations.entries()) {
      // The model answers in the short references it was given, never in
      // identifiers — see reference-token.ts — and only about what is not a
      // plain addition. The first document is all new, so it reports nothing.
      const exceptions =
        index === 0
          ? []
          : index === 1
            ? [
                {
                  observationRef: 'o0',
                  action: 'support' as const,
                  targetItemRef: itemRefFor(
                    'Application mobile pour les équipes terrain.',
                  ),
                  match: 'exact' as const,
                  reason: 'Equivalent statement in another document.',
                },
              ]
            : [
                {
                  observationRef: 'o0',
                  action: 'supersede' as const,
                  targetItemRef: itemRefFor(
                    'Le lancement public est prévu le 12 septembre.',
                  ),
                  reason:
                    'The newer dated decision explicitly postpones launch.',
                },
              ];
      await consolidation.apply(prisma as never, operation, {
        output: {
          promptVersion: 'source-consolidation-v3',
          inputFingerprint: operation.inputFingerprint,
          exceptions,
          clarifications: [],
        },
      });
    }

    const currentRevision = revisions.at(-1)!;
    prisma.projectSource.findUnique.mockResolvedValue({
      id: projectSourceId,
      currentRevisionId,
    });
    prisma.sourceRevision.findFirst.mockResolvedValue(currentRevision);
    prisma.sourceRevisionItem.count.mockResolvedValue(canonicalItems.length);
    prisma.sourceRevisionItem.findMany.mockResolvedValue(
      canonicalItems.map((item) => ({
        id: item.revisionItemId,
        sourceRevisionId: currentRevisionId,
        informationItemId: item.informationItemId,
        kind: item.kind,
        state: item.state,
        content: item.content,
        sortOrder: item.sortOrder,
        categories: item.categories.map((categoryKey) => ({ categoryKey })),
        provenanceLinks: item.provenance.map((origin, index) => ({
          id: `${origin.documentObservationId}-${index}`,
        })),
        informationItem: { clarificationItems: [] },
      })),
    );
    const launch = canonicalItems.find((item) => item.kind === 'date')!;
    const mobile = canonicalItems.find((item) =>
      item.content.startsWith('Application mobile'),
    )!;
    prisma.sourceRevisionItem.findFirst.mockImplementation(({ where }) => {
      const item = canonicalItems.find(
        ({ informationItemId }) =>
          informationItemId === where.informationItemId,
      );
      if (!item) return Promise.resolve(null);
      return Promise.resolve({
        sourceRevisionId: currentRevisionId,
        sourceRevision: currentRevision,
        provenanceLinks: item.provenance.map((origin) => {
          const observation = observations.get(origin.documentObservationId)!;
          return {
            role: origin.role,
            documentObservationId: observation.id,
            contributorAssertionId: null,
            documentObservation: {
              ...observation,
              sourceDocument: documents.get(observation.sourceDocumentId),
            },
            contributorAssertion: null,
          };
        }),
      });
    });
    prisma.sourceRevisionChange.findMany.mockImplementation(({ where }) =>
      Promise.resolve(
        history.filter(
          ({ informationItemId }) =>
            informationItemId === where.informationItemId,
        ),
      ),
    );
    const reads = new SourceRevisionService(asPrismaService(prisma), access);
    const source = await reads.readSource(userId, projectId, {});
    const provenance = await reads.readProvenance(
      userId,
      projectId,
      mobile.informationItemId,
    );

    expect(source).toMatchObject({ total: 4 });
    expect(
      source.items.filter(({ content }) =>
        content.startsWith('Application mobile'),
      ),
    ).toHaveLength(1);
    expect(launch.content).toBe(
      'Le lancement public est prévu le 19 septembre.',
    );
    expect(provenance.origins).toHaveLength(2);
    expect(provenance.origins.map(({ label }) => label)).toEqual([
      'brief-fr',
      'architecture-en',
    ]);
    expect(provenance.history.map(({ change }) => change)).toEqual([
      'added',
      'provenance_added',
    ]);
  });
});
