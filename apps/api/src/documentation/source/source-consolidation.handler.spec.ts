import type { GenerationOperation } from '@prisma/client';
import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../../test/prisma-mock';
import { GenerationHandlerRegistry } from '../../generation/generation-handler.registry';
import { SourceRevisionService } from './source-revision.service';
import { SourceConsolidationHandler } from './source-consolidation.handler';

const operation = {
  id: '00000000-0000-4000-8000-000000000001',
  projectId: '00000000-0000-4000-8000-000000000002',
  type: 'source_consolidation',
  sourceDocumentId: '00000000-0000-4000-8000-000000000003',
  baseSourceRevisionId: '00000000-0000-4000-8000-000000000004',
  inputFingerprint: 'f'.repeat(64),
  promptVersion: 'source-consolidation-v3',
  outputContractVersion: 'diaphane.source-consolidation.v3',
  policySnapshot: { version: 'policy-v1', routes: [] },
} as unknown as GenerationOperation;

const OBSERVATION_ID = '00000000-0000-4000-8000-000000000005';

const output = {
  promptVersion: 'source-consolidation-v3',
  // Nothing to report: the single observation is a plain addition, and the
  // model no longer restates those.
  exceptions: [],
  clarifications: [],
};

describe('SourceConsolidationHandler', () => {
  let prisma: PrismaMock;
  let revisions: jest.Mocked<
    Pick<SourceRevisionService, 'commitFromConsolidation'>
  >;
  let registry: GenerationHandlerRegistry;
  let handler: SourceConsolidationHandler;

  beforeEach(() => {
    prisma = createPrismaMock();
    revisions = { commitFromConsolidation: jest.fn() };
    registry = new GenerationHandlerRegistry();
    handler = new SourceConsolidationHandler(
      asPrismaService(prisma),
      revisions as unknown as SourceRevisionService,
      registry,
    );
    handler.onModuleInit();
  });

  it('registers itself and rejects provider claims for observations outside the document', async () => {
    prisma.documentObservation.findMany.mockResolvedValue([]);

    await expect(
      handler.apply(prisma as never, operation, {
        output: {
          ...output,
          // A short ref, not an identifier: the model is never asked to copy a
          // UUID back — see reference-token.ts.
          exceptions: [
            { observationRef: 'o0', action: 'exclude', reason: 'Boilerplate.' },
          ],
        },
      }),
    ).rejects.toThrow('unknown observation');
    expect(registry.get('source_consolidation')).toBe(handler);
  });

  // The model used to have to emit one record per observation and counts that
  // tallied. On a 61-observation page it miscounted, referenced an item that
  // did not exist, and flagged conflicts it never explained — a different
  // bookkeeping slip every run. Additions are now filled in on our side.
  it('adds every observation the model did not single out', async () => {
    prisma.documentObservation.findMany.mockResolvedValue([
      { id: OBSERVATION_ID, sourceDocumentId: operation.sourceDocumentId },
      { id: 'observation-2', sourceDocumentId: operation.sourceDocumentId },
    ] as never);
    revisions.commitFromConsolidation.mockResolvedValue({
      status: 'committed',
      revisionId: 'revision-1',
    });

    await handler.apply(prisma as never, operation, {
      output: {
        ...output,
        exceptions: [
          { observationRef: 'o1', action: 'exclude', reason: 'Boilerplate.' },
        ],
      },
    });

    const [, , dispositions] = revisions.commitFromConsolidation.mock
      .calls[0] as [
      unknown,
      unknown,
      { observationId: string; action: string }[],
    ];
    expect(dispositions).toEqual([
      expect.objectContaining({ observationId: OBSERVATION_ID, action: 'add' }),
      expect.objectContaining({
        observationId: 'observation-2',
        action: 'exclude',
      }),
    ]);
  });

  it('requeues against the current head when an otherwise valid result is stale', async () => {
    prisma.documentObservation.findMany.mockResolvedValue([
      { id: OBSERVATION_ID, sourceDocumentId: operation.sourceDocumentId },
    ]);
    revisions.commitFromConsolidation.mockResolvedValue({
      status: 'stale',
      currentRevisionId: '00000000-0000-4000-8000-000000000006',
    });

    await handler.apply(prisma as never, operation, { output });

    expect(prisma.generationOperation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          baseSourceRevisionId: '00000000-0000-4000-8000-000000000006',
          replacesOperationId: operation.id,
          status: 'queued',
        }),
      }),
    );
  });

  it('is idempotent when the document already committed the same revision', async () => {
    prisma.documentObservation.findMany.mockResolvedValue([
      { id: OBSERVATION_ID, sourceDocumentId: operation.sourceDocumentId },
    ]);
    revisions.commitFromConsolidation.mockResolvedValue({
      status: 'already_committed',
      revisionId: '00000000-0000-4000-8000-000000000007',
    });

    await handler.apply(prisma as never, operation, { output });

    expect(prisma.generationOperation.upsert).not.toHaveBeenCalled();
  });
  // Told only "never reference something absent from the input", the model
  // answered `targetItemRef: "i1"` against a canonical source holding nothing.
  it('spells out that an empty canonical source leaves nothing to target', async () => {
    prisma.sourceDocument.findFirst.mockResolvedValue({
      id: operation.sourceDocumentId,
      version: 1,
      status: 'ready_to_consolidate',
    });
    prisma.sourceDocument.updateMany.mockResolvedValue({ count: 1 });
    prisma.projectSource.findUnique.mockResolvedValue(null);
    prisma.documentObservation.findMany.mockResolvedValue([
      { id: OBSERVATION_ID, categories: [] },
    ] as never);

    const request = await handler.buildRequest(operation);
    const prompt = request.parts[0] as { text: string };

    expect(prompt.text).toContain('Current item count: 0');
    expect(prompt.text).toContain('canonical source is empty');
  });
});
