import type { GenerationOperation } from '@prisma/client';
import { GenerationHandlerRegistry } from '../../generation/generation-handler.registry';
import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import {
  ReferenceDocumentHandler,
  referenceFingerprint,
  selectReferenceStatements,
} from './reference-document.handler';
import { REFERENCE_DOCUMENT_PROMPT_VERSION } from './reference-output.schema';

const operationId = '00000000-0000-4000-8000-0000000000aa';
const documentId = '00000000-0000-4000-8000-000000000001';
const revisionId = '00000000-0000-4000-8000-000000000002';
const itemA = '00000000-0000-4000-8000-00000000000a';

const items = [
  {
    informationItemId: itemA,
    kind: 'fact' as const,
    state: 'confirmed' as const,
    content: 'The launch is planned for October.',
  },
];

function operation(): GenerationOperation {
  return {
    id: operationId,
    inputFingerprint: referenceFingerprint({
      locale: 'fr',
      sourceRevisionId: revisionId,
      statements: selectReferenceStatements(items),
    }),
  } as GenerationOperation;
}

function writing(overrides: Record<string, unknown> = {}) {
  return {
    id: documentId,
    projectId: 'project-1',
    sourceRevisionId: revisionId,
    locale: 'fr',
    status: 'writing',
    sourceRevision: { items },
    ...overrides,
  };
}

function output(overrides: Record<string, unknown> = {}) {
  return {
    output: {
      promptVersion: REFERENCE_DOCUMENT_PROMPT_VERSION,
      outcome: 'written',
      parts: [
        {
          title: 'Le projet',
          blocks: [
            {
              kind: 'paragraph',
              text: 'Le lancement est prévu en octobre.',
              informationItemIds: [itemA],
            },
          ],
        },
      ],
      ...overrides,
    },
  } as never;
}

describe('ReferenceDocumentHandler', () => {
  function setup() {
    const prisma = createPrismaMock();
    const registry = new GenerationHandlerRegistry();
    return {
      prisma,
      registry,
      handler: new ReferenceDocumentHandler(asPrismaService(prisma), registry),
    };
  }

  it('registers itself for its stage', () => {
    const { registry, handler } = setup();
    handler.onModuleInit();
    expect(registry.get('reference_document')).toBe(handler);
  });

  describe('building the request', () => {
    it('asks for the document in the developer language and carries the statements', async () => {
      const { prisma, handler } = setup();
      prisma.referenceDocument.findUnique.mockResolvedValue(writing());

      const request = await handler.buildRequest(operation());
      const text = (request.parts[0] as { text: string }).text;

      expect(text).toContain('French');
      expect(text).toContain('The launch is planned for October.');
    });

    // The fingerprint is taken over the statements in order. The service reads
    // them sorted; an unsorted read here produced a different fingerprint and the
    // stage refused its own input as drift — on the very first real run.
    it('reads the statements in the order the service recorded them', async () => {
      const { prisma, handler } = setup();
      prisma.referenceDocument.findUnique.mockResolvedValue(writing());

      await handler.buildRequest(operation());

      expect(prisma.referenceDocument.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            sourceRevision: {
              include: { items: { orderBy: { sortOrder: 'asc' } } },
            },
          }),
        }),
      );
    });

    it('refuses a document that is no longer being written', async () => {
      const { prisma, handler } = setup();
      prisma.referenceDocument.findUnique.mockResolvedValue(
        writing({ status: 'superseded' }),
      );

      await expect(handler.buildRequest(operation())).rejects.toThrow(
        'REFERENCE_DOCUMENT_NOT_CURRENT',
      );
    });

    it('refuses when the source moved under a queued write', async () => {
      const { prisma, handler } = setup();
      prisma.referenceDocument.findUnique.mockResolvedValue(
        writing({ sourceRevision: { items: [] } }),
      );

      await expect(handler.buildRequest(operation())).rejects.toThrow(
        'REFERENCE_DOCUMENT_INPUT_DRIFT',
      );
    });
  });

  describe('applying a result', () => {
    it('makes the document current and clears what the project owed', async () => {
      const { prisma, handler } = setup();
      prisma.referenceDocument.findUnique.mockResolvedValue(writing());

      await handler.apply(prisma as never, operation(), output());

      expect(prisma.referenceDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ready',
            outcome: 'written',
          }),
        }),
      );
      expect(prisma.projectSource.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            activeReferenceDocumentId: null,
            referenceNeedsRewrite: false,
          }),
        }),
      );
    });

    // Two documents both reading as current is the same defect as two published
    // releases, one level up.
    it('retires the document it replaces', async () => {
      const { prisma, handler } = setup();
      prisma.referenceDocument.findUnique.mockResolvedValue(writing());

      await handler.apply(prisma as never, operation(), output());

      expect(prisma.referenceDocument.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ready' }),
          data: { status: 'superseded' },
        }),
      );
    });

    it('records a document that found nothing usable', async () => {
      const { prisma, handler } = setup();
      prisma.referenceDocument.findUnique.mockResolvedValue(writing());

      await handler.apply(
        prisma as never,
        operation(),
        output({ outcome: 'nothing_usable', parts: [] }),
      );

      expect(prisma.referenceDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: 'nothing_usable',
            structuredContent: [],
          }),
        }),
      );
    });

    it('refuses a document citing a statement it was never given, and writes nothing', async () => {
      const { prisma, handler } = setup();
      prisma.referenceDocument.findUnique.mockResolvedValue(
        writing({
          sourceRevision: {
            items: [{ ...items[0], informationItemId: 'other' }],
          },
        }),
      );

      await expect(
        handler.apply(prisma as never, operation(), output()),
      ).rejects.toThrow('REFERENCE_DOCUMENT_UNKNOWN_CITATION');
      expect(prisma.referenceDocument.update).not.toHaveBeenCalled();
    });
  });

  describe('when the generation dies', () => {
    it('fails the document, hands the slot back and leaves the rewrite owed', async () => {
      const { prisma, handler } = setup();
      prisma.referenceDocument.findFirst.mockResolvedValue({
        id: documentId,
        projectId: 'project-1',
      });

      await handler.onTerminalFailure(
        prisma as never,
        operation(),
        'PROVIDER_TIMEOUT',
      );

      expect(prisma.referenceDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            failureCode: 'PROVIDER_TIMEOUT',
          }),
        }),
      );
      expect(prisma.projectSource.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            activeReferenceDocumentId: null,
            referenceNeedsRewrite: true,
          }),
        }),
      );
    });

    it('does nothing when the document already reached an end', async () => {
      const { prisma, handler } = setup();
      prisma.referenceDocument.findFirst.mockResolvedValue(null);

      await handler.onTerminalFailure(prisma as never, operation(), 'X');

      expect(prisma.referenceDocument.update).not.toHaveBeenCalled();
    });
  });
});
