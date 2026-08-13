import type { GenerationOperation } from '@prisma/client';
import { GenerationHandlerRegistry } from '../../generation/generation-handler.registry';
import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { DocumentInputNormalizerService } from '../source/document-input-normalizer.service';
import { DocumentStorageClient } from '../source/document-storage.client';
import {
  ReferenceDocumentHandler,
  referenceFingerprint,
} from './reference-document.handler';
import { REFERENCE_DOCUMENT_PROMPT_VERSION } from './reference-output.schema';

const operationId = '00000000-0000-4000-8000-0000000000aa';
const documentId = '00000000-0000-4000-8000-000000000001';

const sourceDocuments = [
  {
    id: 'doc-1',
    title: 'Cahier des charges',
    kind: 'upload',
    storedObjectKey: 'key-1',
    originalFileName: 'cdc.pdf',
    originalMimeType: 'application/pdf',
  },
];
const notes = [
  { id: 'note-1', content: 'Le lancement est en octobre.', context: null },
];

function operation(): GenerationOperation {
  return {
    id: operationId,
    inputFingerprint: referenceFingerprint({
      locale: 'fr',
      documentIds: ['doc-1'],
      noteIds: ['note-1'],
    }),
  } as GenerationOperation;
}

function writing(overrides: Record<string, unknown> = {}) {
  return {
    id: documentId,
    projectId: 'project-1',
    locale: 'fr',
    status: 'writing',
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
          documentRefs: ['d0'],
          blocks: [
            { kind: 'paragraph', text: 'Le produit rend un projet lisible.' },
          ],
        },
      ],
      points: [],
      unrelatedDocumentRefs: [],
      ...overrides,
    },
  } as never;
}

describe('ReferenceDocumentHandler', () => {
  function setup() {
    const prisma = createPrismaMock();
    const registry = new GenerationHandlerRegistry();
    const storage = { get: jest.fn().mockResolvedValue(Buffer.from('pdf')) };
    const normalizer = {
      normalizeUpload: jest
        .fn()
        .mockResolvedValue({ parts: [{ kind: 'text', text: 'contenu' }] }),
      normalizeNotion: jest.fn(),
    };
    return {
      prisma,
      registry,
      normalizer,
      handler: new ReferenceDocumentHandler(
        asPrismaService(prisma),
        registry,
        storage as unknown as DocumentStorageClient,
        normalizer as unknown as DocumentInputNormalizerService,
      ),
    };
  }

  function ready(prisma: ReturnType<typeof createPrismaMock>, doc = writing()) {
    prisma.referenceDocument.findUnique.mockResolvedValue(doc);
    prisma.sourceDocument.findMany.mockResolvedValue(sourceDocuments);
    prisma.note.findMany.mockResolvedValue(notes);
  }

  it('registers itself for its stage', () => {
    const { registry, handler } = setup();
    handler.onModuleInit();
    expect(registry.get('reference_document')).toBe(handler);
  });

  describe('building the request', () => {
    it('sends the documents themselves and the notes, in the developer language', async () => {
      const { prisma, handler } = setup();
      ready(prisma);

      const request = await handler.buildRequest(operation());
      const prompt = (request.parts[0] as { text: string }).text;

      expect(prompt).toContain('French');
      expect(prompt).toContain('d0: Cahier des charges');
      expect(prompt).toContain('Le lancement est en octobre.');
    });

    // FR-014: a note is replayed on every write, and outranks the documents.
    it('tells the model a note outranks the documents', async () => {
      const { prisma, handler } = setup();
      ready(prisma);

      const prompt = (
        (await handler.buildRequest(operation())).parts[0] as { text: string }
      ).text;

      expect(prompt).toContain('A note outranks the documents');
    });

    it('carries each document body after its heading', async () => {
      const { prisma, normalizer, handler } = setup();
      ready(prisma);

      const request = await handler.buildRequest(operation());

      expect(normalizer.normalizeUpload).toHaveBeenCalled();
      expect(
        request.parts.some(
          (part) =>
            part.kind === 'text' &&
            part.text.includes('d0: Cahier des charges'),
        ),
      ).toBe(true);
    });

    it('refuses a document that is no longer being written', async () => {
      const { prisma, handler } = setup();
      ready(prisma, writing({ status: 'superseded' }));

      await expect(handler.buildRequest(operation())).rejects.toThrow(
        'REFERENCE_DOCUMENT_NOT_CURRENT',
      );
    });

    // A note added after the work was queued changes the answer, so the write
    // is refused rather than made from an input nobody asked for.
    it('refuses when the notes moved under a queued write', async () => {
      const { prisma, handler } = setup();
      ready(prisma);
      prisma.note.findMany.mockResolvedValue([]);

      await expect(handler.buildRequest(operation())).rejects.toThrow(
        'REFERENCE_DOCUMENT_INPUT_DRIFT',
      );
    });
  });

  describe('applying a result', () => {
    function applied(prisma: ReturnType<typeof createPrismaMock>) {
      prisma.referenceDocument.findUnique.mockResolvedValue(writing());
      prisma.sourceDocument.findMany.mockResolvedValue(sourceDocuments);
    }

    it('makes the document current and clears what the project owed', async () => {
      const { prisma, handler } = setup();
      applied(prisma);

      await handler.apply(prisma as never, operation(), output());

      expect(prisma.referenceDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ready',
            outcome: 'written',
          }),
        }),
      );
      expect(prisma.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ referenceNeedsRewrite: false }),
        }),
      );
    });

    // FR-018: the truth moved, so every section written against the old one is
    // owed a refresh. It says so and waits; it never recomposes itself.
    it('leaves every section owed a refresh', async () => {
      const { prisma, handler } = setup();
      applied(prisma);

      await handler.apply(prisma as never, operation(), output());

      expect(prisma.clientSection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ refreshNeeded: true }),
        }),
      );
    });

    it('retires the document it replaces', async () => {
      const { prisma, handler } = setup();
      applied(prisma);

      await handler.apply(prisma as never, operation(), output());

      expect(prisma.referenceDocument.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ready' }),
          data: { status: 'superseded' },
        }),
      );
    });

    it('stores the points beside the document', async () => {
      const { prisma, handler } = setup();
      applied(prisma);

      await handler.apply(
        prisma as never,
        operation(),
        output({
          parts: [
            {
              title: 'Planning',
              documentRefs: ['d0'],
              blocks: [
                { kind: 'gap', text: 'Date non confirmée.', pointRef: 'p0' },
              ],
            },
          ],
          points: [
            { ref: 'p0', question: 'Quelle date ?', why: 'Le client la lira.' },
          ],
        }),
      );

      expect(prisma.referenceDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            points: [
              {
                id: 'p0',
                question: 'Quelle date ?',
                why: 'Le client la lira.',
              },
            ],
          }),
        }),
      );
    });

    // FR-017: an upload mistake is named, not woven in. Dropping this on the
    // floor would leave the developer wondering why their document changed
    // nothing.
    it('names a document that has nothing to do with the project', async () => {
      const { prisma, handler } = setup();
      applied(prisma);

      await handler.apply(
        prisma as never,
        operation(),
        output({ unrelatedDocumentRefs: ['d0'] }),
      );

      expect(prisma.referenceDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            unrelatedDocuments: ['Cahier des charges'],
          }),
        }),
      );
    });

    it('refuses a part drawing on a document it was never given', async () => {
      const { prisma, handler } = setup();
      applied(prisma);

      await expect(
        handler.apply(
          prisma as never,
          operation(),
          output({
            parts: [
              {
                title: 'Le projet',
                documentRefs: ['d9'],
                blocks: [{ kind: 'paragraph', text: 'Inventé.' }],
              },
            ],
          }),
        ),
      ).rejects.toThrow('REFERENCE_DOCUMENT_UNKNOWN_DOCUMENT_d9');
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

      await handler.onTerminalFailure(prisma as never, operation(), 'TIMEOUT');

      expect(prisma.referenceDocument.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'failed',
            failureCode: 'TIMEOUT',
          }),
        }),
      );
      expect(prisma.project.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ referenceNeedsRewrite: true }),
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
