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
  promptVersion: 'source-consolidation-v1',
  outputContractVersion: 'diaphane.source-consolidation.v1',
  policySnapshot: { version: 'policy-v1', routes: [] },
} as unknown as GenerationOperation;

const output = {
  promptVersion: 'source-consolidation-v1',
  inputFingerprint: 'f'.repeat(64),
  dispositions: [
    {
      observationId: '00000000-0000-4000-8000-000000000005',
      action: 'add',
      reason: 'New supported fact.',
    },
  ],
  clarifications: [],
  accounting: {
    inputObservationCount: 1,
    dispositionCount: 1,
    clarificationCount: 0,
  },
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
      handler.apply(prisma as never, operation, { output }),
    ).rejects.toThrow('unknown observation');
    expect(registry.get('source_consolidation')).toBe(handler);
  });

  it('requeues against the current head when an otherwise valid result is stale', async () => {
    prisma.documentObservation.findMany.mockResolvedValue([
      {
        id: output.dispositions[0].observationId,
        sourceDocumentId: operation.sourceDocumentId,
      },
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
      {
        id: output.dispositions[0].observationId,
        sourceDocumentId: operation.sourceDocumentId,
      },
    ]);
    revisions.commitFromConsolidation.mockResolvedValue({
      status: 'already_committed',
      revisionId: '00000000-0000-4000-8000-000000000007',
    });

    await handler.apply(prisma as never, operation, { output });

    expect(prisma.generationOperation.upsert).not.toHaveBeenCalled();
  });
});
