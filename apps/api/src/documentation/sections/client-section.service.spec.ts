import { NotFoundException } from '@nestjs/common';
import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { ProjectAccessService } from '../../projects/project-access.service';
import { ClientSectionService } from './client-section.service';

const projectId = '00000000-0000-4000-8000-000000000001';
const sectionId = '00000000-0000-4000-8000-000000000002';
const otherSectionId = '00000000-0000-4000-8000-000000000003';
const referenceId = '00000000-0000-4000-8000-000000000004';
const userId = 'user-1';

const editorial = {
  length: 'balanced' as const,
  pedagogy: 'guided' as const,
  technicalFamiliarity: 'novice' as const,
  tone: 'reassuring' as const,
};

function sectionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: sectionId,
    projectId,
    name: 'Ce que le client a demandé',
    instructions: 'La demande initiale et ses contraintes.',
    ...editorial,
    sortOrder: 0,
    refreshNeeded: true,
    archivedAt: null,
    activeProposalId: null,
    createdByUserId: userId,
    version: 1,
    createdAt: new Date('2026-08-12T10:00:00.000Z'),
    updatedAt: new Date('2026-08-12T10:00:00.000Z'),
    activeProposal: null,
    proposals: [],
    ...overrides,
  };
}

describe('ClientSectionService', () => {
  function setup() {
    const prisma = createPrismaMock();
    const access = {
      requireContributor: jest.fn().mockResolvedValue({ role: 'contributor' }),
    };
    return {
      prisma,
      access,
      service: new ClientSectionService(
        asPrismaService(prisma),
        access as unknown as ProjectAccessService,
      ),
    };
  }

  function withReferenceDocument(prisma: ReturnType<typeof createPrismaMock>) {
    prisma.referenceDocument.count.mockResolvedValue(1);
  }

  describe('access', () => {
    it('hides a project the caller is not a contributor on, exactly as a missing one', async () => {
      const { access, service } = setup();
      access.requireContributor.mockRejectedValue(
        new NotFoundException({ code: 'NOT_FOUND' }),
      );

      await expect(service.list(userId, projectId)).rejects.toMatchObject({
        response: { code: 'NOT_FOUND' },
      });
    });

    it('checks access before reading anything', async () => {
      const { prisma, access, service } = setup();
      access.requireContributor.mockRejectedValue(
        new NotFoundException({ code: 'NOT_FOUND' }),
      );

      await expect(
        service.create(userId, projectId, {
          name: 'Planning',
          instructions: 'Les jalons.',
          editorial,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.referenceDocument.count).not.toHaveBeenCalled();
      expect(prisma.clientSection.create).not.toHaveBeenCalled();
    });
  });

  describe('creating', () => {
    // Plan, Decision 4: a section is a view of the reference document, so
    // there is nothing to define one against before one exists.
    it('refuses a project with no reference document yet', async () => {
      const { prisma, service } = setup();
      prisma.referenceDocument.count.mockResolvedValue(0);

      await expect(
        service.create(userId, projectId, {
          name: 'Planning',
          instructions: 'Les jalons.',
          editorial,
        }),
      ).rejects.toMatchObject({ response: { code: 'NO_REFERENCE_DOCUMENT' } });
      expect(prisma.clientSection.create).not.toHaveBeenCalled();
    });

    it('appends after the last section rather than colliding with it', async () => {
      const { prisma, service } = setup();
      withReferenceDocument(prisma);
      prisma.clientSection.findFirst.mockResolvedValue({ sortOrder: 4 });
      prisma.clientSection.create.mockResolvedValue(
        sectionRow({ sortOrder: 5 }),
      );

      await service.create(userId, projectId, {
        name: 'Planning',
        instructions: 'Les jalons.',
        editorial,
      });

      expect(prisma.clientSection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sortOrder: 5, projectId }),
        }),
      );
    });

    it('starts the first section at zero', async () => {
      const { prisma, service } = setup();
      withReferenceDocument(prisma);
      prisma.clientSection.findFirst.mockResolvedValue(null);
      prisma.clientSection.create.mockResolvedValue(sectionRow());

      await service.create(userId, projectId, {
        name: 'Planning',
        instructions: 'Les jalons.',
        editorial,
      });

      expect(prisma.clientSection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sortOrder: 0 }),
        }),
      );
    });

    it('records the author and the editorial dimensions on the section itself', async () => {
      const { prisma, service } = setup();
      withReferenceDocument(prisma);
      prisma.clientSection.findFirst.mockResolvedValue(null);
      prisma.clientSection.create.mockResolvedValue(sectionRow());

      const view = await service.create(userId, projectId, {
        name: '  Planning  ',
        instructions: '  Les jalons.  ',
        editorial,
      });

      expect(prisma.clientSection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Planning',
            instructions: 'Les jalons.',
            createdByUserId: userId,
            tone: 'reassuring',
            technicalFamiliarity: 'novice',
          }),
        }),
      );
      expect(view.editorial.tone).toBe('reassuring');
    });

    it('comes back needing a refresh, since it has never composed', async () => {
      const { prisma, service } = setup();
      withReferenceDocument(prisma);
      prisma.clientSection.findFirst.mockResolvedValue(null);
      prisma.clientSection.create.mockResolvedValue(sectionRow());

      const view = await service.create(userId, projectId, {
        name: 'Planning',
        instructions: 'Les jalons.',
        editorial,
      });

      expect(view.refreshNeeded).toBe(true);
      expect(view.activeProposal).toBeNull();
      expect(view.hasPublishedContent).toBe(false);
    });
  });

  describe('listing', () => {
    it('returns live sections in the order the contributor chose', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findMany.mockResolvedValue([
        sectionRow({ sortOrder: 0 }),
        sectionRow({ id: otherSectionId, sortOrder: 1, name: 'Planning' }),
      ]);

      const { sections } = await service.list(userId, projectId);

      expect(sections.map(({ name }) => name)).toEqual([
        'Ce que le client a demandé',
        'Planning',
      ]);
      expect(prisma.clientSection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId, archivedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        }),
      );
    });

    it('reports a section the client can already read', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findMany.mockResolvedValue([
        sectionRow({ proposals: [{ id: 'proposal-1' }] }),
      ]);

      const { sections } = await service.list(userId, projectId);

      expect(sections[0].hasPublishedContent).toBe(true);
    });

    it('surfaces a composition in flight', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findMany.mockResolvedValue([
        sectionRow({
          activeProposal: {
            id: 'proposal-1',
            sectionId,
            referenceDocumentId: referenceId,
            status: 'composing',
            version: 1,
            changeSummary: null,
            createdAt: new Date('2026-08-12T11:00:00.000Z'),
          },
        }),
      ]);

      const { sections } = await service.list(userId, projectId);

      expect(sections[0].activeProposal).toMatchObject({
        status: 'composing',
        createdAt: '2026-08-12T11:00:00.000Z',
      });
    });
  });

  describe('updating', () => {
    it('refuses a stale version instead of overwriting a concurrent edit', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findFirst.mockResolvedValue({ id: sectionId });
      prisma.clientSection.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update(userId, projectId, sectionId, {
          name: 'Planning',
          expectedVersion: 1,
        }),
      ).rejects.toMatchObject({ response: { code: 'SECTION_STALE' } });
    });

    it('carries the expected version in the where clause, not in a prior read', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findFirst.mockResolvedValue({ id: sectionId });
      prisma.clientSection.updateMany.mockResolvedValue({ count: 1 });
      prisma.clientSection.findUnique.mockResolvedValue(
        sectionRow({ version: 3 }),
      );

      await service.update(userId, projectId, sectionId, {
        name: 'Planning',
        expectedVersion: 2,
      });

      expect(prisma.clientSection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ version: 2, archivedAt: null }),
        }),
      );
    });

    it('marks the section for refresh when its definition changes (FR-020)', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findFirst.mockResolvedValue({ id: sectionId });
      prisma.clientSection.updateMany.mockResolvedValue({ count: 1 });
      prisma.clientSection.findUnique.mockResolvedValue(sectionRow());

      await service.update(userId, projectId, sectionId, {
        instructions: 'Autre chose.',
        expectedVersion: 1,
      });

      expect(prisma.clientSection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ refreshNeeded: true }),
        }),
      );
    });

    it('refuses an update that changes nothing', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findFirst.mockResolvedValue({ id: sectionId });

      await expect(
        service.update(userId, projectId, sectionId, { expectedVersion: 1 }),
      ).rejects.toMatchObject({ response: { code: 'SECTION_UPDATE_EMPTY' } });
      expect(prisma.clientSection.updateMany).not.toHaveBeenCalled();
    });

    it('hides a section belonging to another project', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findFirst.mockResolvedValue(null);

      await expect(
        service.update(userId, projectId, sectionId, {
          name: 'Planning',
          expectedVersion: 1,
        }),
      ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    });
  });

  describe('archiving', () => {
    it('marks it archived and releases any proposal it was holding', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findFirst.mockResolvedValue({ id: sectionId });
      prisma.clientSection.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.archive(userId, projectId, sectionId),
      ).resolves.toEqual({ archived: true });
      expect(prisma.clientSection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ activeProposalId: null }),
        }),
      );
      expect(prisma.clientSection.delete).not.toHaveBeenCalled();
    });

    it('reports a section already archived as missing', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findFirst.mockResolvedValue({ id: sectionId });
      prisma.clientSection.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.archive(userId, projectId, sectionId),
      ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
    });
  });

  describe('reordering', () => {
    it('writes the requested order', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findMany
        .mockResolvedValueOnce([{ id: sectionId }, { id: otherSectionId }])
        .mockResolvedValueOnce([]);
      prisma.clientSection.update.mockImplementation(
        (args: unknown) => args as never,
      );

      await service.reorder(userId, projectId, {
        orderedSectionIds: [otherSectionId, sectionId],
      });

      expect(prisma.clientSection.update).toHaveBeenNthCalledWith(1, {
        where: { id: otherSectionId },
        data: { sortOrder: 0 },
      });
      expect(prisma.clientSection.update).toHaveBeenNthCalledWith(2, {
        where: { id: sectionId },
        data: { sortOrder: 1 },
      });
    });

    it('never marks anything for refresh — an order change says nothing new', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findMany
        .mockResolvedValueOnce([{ id: sectionId }])
        .mockResolvedValueOnce([]);
      prisma.clientSection.update.mockImplementation(
        (args: unknown) => args as never,
      );

      await service.reorder(userId, projectId, {
        orderedSectionIds: [sectionId],
      });

      const wrote = prisma.clientSection.update.mock.calls.map(
        ([args]) => (args as { data: Record<string, unknown> }).data,
      );
      expect(wrote.every((data) => !('refreshNeeded' in data))).toBe(true);
    });

    it('refuses an order naming a section twice', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findMany.mockResolvedValue([
        { id: sectionId },
        { id: otherSectionId },
      ]);

      await expect(
        service.reorder(userId, projectId, {
          orderedSectionIds: [sectionId, sectionId],
        }),
      ).rejects.toMatchObject({
        response: { code: 'SECTION_ORDER_DUPLICATE' },
      });
      expect(prisma.clientSection.update).not.toHaveBeenCalled();
    });

    it('refuses an order that leaves a live section unplaced', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findMany.mockResolvedValue([
        { id: sectionId },
        { id: otherSectionId },
      ]);

      await expect(
        service.reorder(userId, projectId, {
          orderedSectionIds: [sectionId],
        }),
      ).rejects.toMatchObject({
        response: { code: 'SECTION_ORDER_INCOMPLETE' },
      });
    });

    it('refuses an order naming a section from another project', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findMany.mockResolvedValue([{ id: sectionId }]);

      await expect(
        service.reorder(userId, projectId, {
          orderedSectionIds: [otherSectionId],
        }),
      ).rejects.toMatchObject({
        response: { code: 'SECTION_ORDER_INCOMPLETE' },
      });
      expect(prisma.clientSection.update).not.toHaveBeenCalled();
    });
  });
});
