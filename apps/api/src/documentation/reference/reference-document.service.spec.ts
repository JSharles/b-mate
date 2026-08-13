import { NotFoundException } from '@nestjs/common';
import { GenerationService } from '../../generation/generation.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { ReferenceDocumentService } from './reference-document.service';

const projectId = '00000000-0000-4000-8000-000000000001';
const sourceId = '00000000-0000-4000-8000-000000000002';
const documentId = '00000000-0000-4000-8000-000000000004';
const operationId = '00000000-0000-4000-8000-000000000005';

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
    prisma.projectSource.upsert.mockResolvedValue({
      id: sourceId,
      activeReferenceDocumentId: null,
      ...overrides,
    });
    prisma.sourceDocument.findMany.mockResolvedValue([{ id: 'doc-1' }]);
    prisma.note.findMany.mockResolvedValue([{ id: 'note-1' }]);
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
    it('queues the work from the documents and the notes', async () => {
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
    });

    it('refuses to write from a project with no document', async () => {
      const { prisma, service } = setup();
      readyToWrite(prisma);
      prisma.sourceDocument.findMany.mockResolvedValue([]);

      await expect(
        service.write('user', projectId, 'fr'),
      ).rejects.toMatchObject({
        response: { code: 'NO_DOCUMENTS' },
      });
    });

    // A project with documents but no note is the normal first write.
    it('writes from documents alone', async () => {
      const { prisma, service } = setup();
      readyToWrite(prisma);
      prisma.note.findMany.mockResolvedValue([]);

      await expect(
        service.write('user', projectId, 'fr'),
      ).resolves.toMatchObject({
        documentId,
      });
    });

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
  });

  describe('notes', () => {
    function withAuthor(prisma: ReturnType<typeof createPrismaMock>) {
      prisma.note.create.mockResolvedValue({
        id: 'note-1',
        content: 'Le lancement est en octobre.',
        context: 'Quelle date de lancement ?',
        createdAt: new Date('2026-08-13T10:00:00.000Z'),
        author: { firstName: 'Jean-Charles', lastName: 'Barq' },
      });
      prisma.projectSource.updateMany.mockResolvedValue({ count: 1 });
    }

    // FR-012: an answer and a correction are the same thing.
    it('keeps what prompted it, frozen beside what was written', async () => {
      const { prisma, service } = setup();
      withAuthor(prisma);

      await expect(
        service.addNote('user', projectId, {
          content: 'Le lancement est en octobre.',
          context: 'Quelle date de lancement ?',
        }),
      ).resolves.toMatchObject({
        content: 'Le lancement est en octobre.',
        context: 'Quelle date de lancement ?',
        authorName: 'Jean-Charles Barq',
      });
    });

    // FR-006: a new note owes a rewrite, it never triggers one.
    it('marks the document owed rather than rewriting it', async () => {
      const { prisma, service } = setup();
      withAuthor(prisma);

      await service.addNote('user', projectId, { content: 'Octobre.' });

      expect(prisma.projectSource.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { referenceNeedsRewrite: true },
        }),
      );
      expect(prisma.referenceDocument.create).not.toHaveBeenCalled();
    });

    it('hides a removed note rather than deleting it', async () => {
      const { prisma, service } = setup();
      prisma.note.updateMany.mockResolvedValue({ count: 1 });
      prisma.projectSource.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.removeNote('user', projectId, 'note-1'),
      ).resolves.toEqual({ removed: true });
      expect(prisma.note.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ archivedAt: expect.any(Date) }),
        }),
      );
      expect(prisma.note.delete).not.toHaveBeenCalled();
    });

    it('hides a note from another project as missing', async () => {
      const { prisma, service } = setup();
      prisma.note.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.removeNote('user', projectId, 'note-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reading', () => {
    it('withholds the parts and the points while it is still being written', async () => {
      const { prisma, service } = setup();
      prisma.referenceDocument.findFirst.mockResolvedValue({
        id: documentId,
        status: 'writing',
        outcome: null,
        locale: 'fr',
        structuredContent: null,
        points: null,
        failureCode: null,
        createdAt: new Date('2026-08-13T10:00:00.000Z'),
        version: 1,
      });

      await expect(service.current('user', projectId)).resolves.toMatchObject({
        status: 'writing',
        parts: [],
        points: [],
      });
    });

    it('reports a project that has never had one', async () => {
      const { prisma, service } = setup();
      prisma.referenceDocument.findFirst.mockResolvedValue(null);

      await expect(service.current('user', projectId)).resolves.toBeNull();
    });
  });

  describe('the summary', () => {
    // FR-016c: a count and a way in, never a second list of the points.
    it('counts what the write will read, and what is still open', async () => {
      const { prisma, service } = setup();
      prisma.sourceDocument.count.mockResolvedValue(2);
      prisma.note.count.mockResolvedValue(3);
      prisma.projectSource.findUnique.mockResolvedValue({
        referenceNeedsRewrite: true,
      });
      prisma.referenceDocument.findFirst.mockResolvedValue({
        id: documentId,
        status: 'ready',
        outcome: 'written',
        locale: 'fr',
        structuredContent: [],
        points: [{ id: 'p0' }, { id: 'p1' }],
        failureCode: null,
        createdAt: new Date(),
        version: 2,
      });

      await expect(service.summary('user', projectId)).resolves.toMatchObject({
        documentCount: 2,
        noteCount: 3,
        openPointCount: 2,
        needsRewrite: true,
      });
    });

    it('answers for a project with nothing at all', async () => {
      const { prisma, service } = setup();
      prisma.sourceDocument.count.mockResolvedValue(0);
      prisma.note.count.mockResolvedValue(0);
      prisma.projectSource.findUnique.mockResolvedValue(null);
      prisma.referenceDocument.findFirst.mockResolvedValue(null);

      await expect(service.summary('user', projectId)).resolves.toMatchObject({
        documentCount: 0,
        openPointCount: 0,
        needsRewrite: true,
        document: null,
      });
    });
  });
});
