import { NotFoundException } from '@nestjs/common';
import { GenerationService } from '../../generation/generation.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { ReferenceDocumentService } from './reference-document.service';

const projectId = '00000000-0000-4000-8000-000000000001';
const sourceId = '00000000-0000-4000-8000-000000000002';
const revisionId = '00000000-0000-4000-8000-000000000003';
const documentId = '00000000-0000-4000-8000-000000000004';
const operationId = '00000000-0000-4000-8000-000000000005';

const items = [
  {
    informationItemId: '00000000-0000-4000-8000-00000000000a',
    kind: 'fact',
    state: 'confirmed',
    content: 'The launch is planned for October.',
    sortOrder: 0,
  },
];

describe('ReferenceDocumentService', () => {
  function setup() {
    const prisma = createPrismaMock();
    const access = {
      requireContributor: jest.fn().mockResolvedValue({ role: 'contributor' }),
    };
    const generation = {
      createInTransaction: jest.fn().mockResolvedValue({ id: operationId }),
    };
    return {
      prisma,
      access,
      generation,
      service: new ReferenceDocumentService(
        asPrismaService(prisma),
        access as unknown as ProjectAccessService,
        generation as unknown as GenerationService,
      ),
    };
  }

  function readyToWrite(
    prisma: ReturnType<typeof createPrismaMock>,
    overrides = {},
  ) {
    prisma.projectSource.findUnique.mockResolvedValue({
      id: sourceId,
      currentRevisionId: revisionId,
      activeReferenceDocumentId: null,
      ...overrides,
    });
    prisma.sourceRevisionItem.findMany.mockResolvedValue(items);
    prisma.referenceDocument.count.mockResolvedValue(0);
    prisma.referenceDocument.create.mockResolvedValue({ id: documentId });
    prisma.projectSource.updateMany.mockResolvedValue({ count: 1 });
  }

  it('hides a project the caller is not a contributor on', async () => {
    const { access, service } = setup();
    access.requireContributor.mockRejectedValue(
      new NotFoundException({ code: 'NOT_FOUND' }),
    );

    await expect(service.summary('user', projectId)).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
  });

  describe('writing', () => {
    it('queues the work and claims the slot', async () => {
      const { prisma, generation, service } = setup();
      readyToWrite(prisma);

      await expect(service.write('user', projectId, 'fr')).resolves.toEqual({
        documentId,
        operationId,
      });
      expect(generation.createInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: 'reference_document' }),
      );
      expect(prisma.projectSource.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ activeReferenceDocumentId: null }),
        }),
      );
    });

    it('writes it in the language it was asked for', async () => {
      const { prisma, service } = setup();
      readyToWrite(prisma);

      await service.write('user', projectId, 'fr');

      expect(prisma.referenceDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ locale: 'fr' }),
        }),
      );
    });

    // FR-025: an unknown language falls back rather than blocking the work.
    it('falls back to English when the language is unknown', async () => {
      const { prisma, service } = setup();
      readyToWrite(prisma);

      await service.write('user', projectId, null);

      expect(prisma.referenceDocument.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ locale: 'en' }),
        }),
      );
    });

    it('refuses a second write while one is running', async () => {
      const { prisma, service } = setup();
      readyToWrite(prisma, { activeReferenceDocumentId: documentId });
      prisma.referenceDocument.findFirst.mockResolvedValue({ id: documentId });

      await expect(
        service.write('user', projectId, 'fr'),
      ).rejects.toMatchObject({
        response: { code: 'REFERENCE_WRITING' },
      });
      expect(prisma.referenceDocument.create).not.toHaveBeenCalled();
    });

    it('lets a project whose last write died try again', async () => {
      const { prisma, service } = setup();
      readyToWrite(prisma, { activeReferenceDocumentId: documentId });
      prisma.referenceDocument.findFirst.mockResolvedValue(null);

      await expect(
        service.write('user', projectId, 'fr'),
      ).resolves.toMatchObject({
        documentId,
      });
    });

    it('loses the race rather than writing twice', async () => {
      const { prisma, service } = setup();
      readyToWrite(prisma);
      prisma.projectSource.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.write('user', projectId, 'fr'),
      ).rejects.toMatchObject({
        response: { code: 'REFERENCE_WRITING' },
      });
    });

    it('refuses to write from an empty source', async () => {
      const { prisma, service } = setup();
      readyToWrite(prisma);
      prisma.sourceRevisionItem.findMany.mockResolvedValue([]);

      await expect(
        service.write('user', projectId, 'fr'),
      ).rejects.toMatchObject({
        response: { code: 'NO_CANONICAL_CONTENT' },
      });
    });
  });

  describe('reading', () => {
    it('withholds the parts while it is still being written', async () => {
      const { prisma, service } = setup();
      prisma.referenceDocument.findFirst.mockResolvedValue({
        id: documentId,
        sourceRevisionId: revisionId,
        status: 'writing',
        outcome: null,
        locale: 'fr',
        structuredContent: null,
        failureCode: null,
        createdAt: new Date('2026-08-13T10:00:00.000Z'),
        version: 1,
      });

      await expect(service.current('user', projectId)).resolves.toMatchObject({
        status: 'writing',
        parts: [],
        citedStatements: [],
      });
    });

    it('reports a project that has never had one', async () => {
      const { prisma, service } = setup();
      prisma.referenceDocument.findFirst.mockResolvedValue(null);

      await expect(service.current('user', projectId)).resolves.toBeNull();
    });

    // The document holds prose; correcting a statement needs the statement, and
    // the passage citing it does not carry its wording.
    it('carries the statements it cites, with their own wording', async () => {
      const { prisma, service } = setup();
      prisma.referenceDocument.findFirst.mockResolvedValue({
        id: documentId,
        sourceRevisionId: revisionId,
        status: 'ready',
        outcome: 'written',
        locale: 'fr',
        structuredContent: [
          {
            title: 'Le projet',
            blocks: [
              {
                kind: 'paragraph',
                text: 'Prose.',
                informationItemIds: ['item-a'],
              },
            ],
          },
        ],
        failureCode: null,
        createdAt: new Date('2026-08-13T10:00:00.000Z'),
        version: 2,
      });
      prisma.sourceRevisionItem.findMany.mockResolvedValue([
        { informationItemId: 'item-a', content: 'The launch is in October.' },
      ]);

      await expect(service.current('user', projectId)).resolves.toMatchObject({
        citedStatements: [
          { id: 'item-a', content: 'The launch is in October.' },
        ],
      });
    });
  });

  describe('the summary', () => {
    it('counts what the source holds and whether a rewrite is owed', async () => {
      const { prisma, service } = setup();
      prisma.projectSource.findUnique.mockResolvedValue({
        currentRevisionId: revisionId,
        referenceNeedsRewrite: true,
        currentRevision: { createdAt: new Date('2026-08-13T09:00:00.000Z') },
      });
      prisma.sourceRevisionItem.count
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(2);
      prisma.sourceDocument.count.mockResolvedValue(2);
      prisma.referenceDocument.findFirst.mockResolvedValue(null);

      await expect(service.summary('user', projectId)).resolves.toMatchObject({
        statementCount: 100,
        openPointCount: 2,
        documentCount: 2,
        needsRewrite: true,
        document: null,
      });
    });

    it('answers for a project with no source at all', async () => {
      const { prisma, service } = setup();
      prisma.projectSource.findUnique.mockResolvedValue(null);
      prisma.sourceDocument.count.mockResolvedValue(0);
      prisma.referenceDocument.findFirst.mockResolvedValue(null);

      await expect(service.summary('user', projectId)).resolves.toMatchObject({
        statementCount: 0,
        sourceRevisionId: null,
        lastChangedAt: null,
      });
    });
  });
});
