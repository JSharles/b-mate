import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { GenerationService } from '../../generation/generation.service';
import { ClientPublicationService } from './client-publication.service';

const proposal = {
  id: 'proposal',
  sectionId: 'section-overview',
  sourceRevisionId: 'revision',
  approvedByUserId: 'user',
  structuredContent: [],
};

describe('ClientPublicationService', () => {
  function setup() {
    const prisma = createPrismaMock();
    const generation = {
      createInTransaction: jest.fn().mockResolvedValue({ id: 'operation' }),
    };
    return {
      prisma,
      generation,
      service: new ClientPublicationService(
        asPrismaService(prisma),
        generation as unknown as GenerationService,
      ),
    };
  }

  describe('queueing an approved section', () => {
    function readyToQueue(prisma: ReturnType<typeof createPrismaMock>) {
      prisma.clientSection.findUnique.mockResolvedValue({
        projectId: 'project',
      });
      prisma.projectClientPublication.upsert.mockResolvedValue({
        projectId: 'project',
        currentReleaseId: 'base',
        nextSequence: 2,
      });
      prisma.clientContentReleaseEntry.findMany.mockResolvedValue([
        {
          sectionId: 'section-planning',
          locale: 'fr',
          clientSectionContentId: 'kept',
        },
        {
          sectionId: 'section-overview',
          locale: 'fr',
          clientSectionContentId: 'replaced',
        },
      ]);
      prisma.clientContentRelease.create.mockResolvedValue({ id: 'release' });
    }

    it('carries every other section across and re-derives only this one', async () => {
      const { prisma, generation, service } = setup();
      readyToQueue(prisma);

      await expect(
        service.queueApprovedProposal(proposal as never),
      ).resolves.toBe('release');

      // Two sections expected: the one kept by reference and the one being
      // approved. The kept entry is copied, never re-derived, so approving one
      // section never re-bills the others.
      expect(prisma.clientContentRelease.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            expectedSectionCount: 2,
            baseReleaseId: 'base',
            reason: 'section_approval',
            initiatingProposalId: 'proposal',
            entries: {
              create: [
                {
                  sectionId: 'section-planning',
                  locale: 'fr',
                  clientSectionContentId: 'kept',
                },
              ],
            },
          }),
        }),
      );
      expect(generation.createInTransaction).toHaveBeenCalledTimes(1);
      expect(generation.createInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: 'client_derivation',
          sectionProposalId: 'proposal',
          clientReleaseId: 'release',
        }),
      );
    });

    it('publishes the first section of a project with nothing published yet', async () => {
      const { prisma, service } = setup();
      readyToQueue(prisma);
      prisma.projectClientPublication.upsert.mockResolvedValue({
        projectId: 'project',
        currentReleaseId: null,
        nextSequence: 1,
      });

      await service.queueApprovedProposal(proposal as never);

      expect(prisma.clientContentReleaseEntry.findMany).not.toHaveBeenCalled();
      expect(prisma.clientContentRelease.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ expectedSectionCount: 1 }),
        }),
      );
    });

    it('refuses to publish for a section that no longer exists', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findUnique.mockResolvedValue(null);

      await expect(
        service.queueApprovedProposal(proposal as never),
      ).rejects.toThrow('CLIENT_PUBLICATION_SECTION_MISSING');
    });
  });

  describe('what the client reads', () => {
    it('serves published sections in the order their author chose', async () => {
      const { prisma, service } = setup();
      prisma.projectClientPublication.findUnique.mockResolvedValue({
        currentRelease: {
          id: 'release',
          sequence: 2,
          status: 'published',
          expectedSectionCount: 2,
          publishedAt: new Date('2026-01-01'),
          entries: [
            {
              sectionId: 'section-planning',
              section: {
                name: 'Planning',
                kind: 'prose',
                currentMilestoneId: null,
                sortOrder: 1,
                archivedAt: null,
              },
              clientSectionContent: {
                structuredContent: [{ text: 'Later' }],
              },
            },
            {
              sectionId: 'section-overview',
              section: {
                name: 'The project',
                kind: 'prose',
                currentMilestoneId: null,
                sortOrder: 0,
                archivedAt: null,
              },
              clientSectionContent: {
                structuredContent: [{ text: 'Hello' }],
              },
            },
          ],
        },
      });

      await expect(service.readPublicSections('project')).resolves.toEqual([
        {
          id: 'section-overview',
          name: 'The project',
          kind: 'prose',
          blocks: [{ text: 'Hello' }],
        },
        {
          id: 'section-planning',
          name: 'Planning',
          kind: 'prose',
          blocks: [{ text: 'Later' }],
        },
      ]);
    });

    // FR-023: archiving a section stops the client reading it without waiting
    // for a fresh release, which would otherwise leave a deleted heading live.
    it('hides an archived section from a release that still carries it', async () => {
      const { prisma, service } = setup();
      prisma.projectClientPublication.findUnique.mockResolvedValue({
        currentRelease: {
          id: 'release',
          sequence: 2,
          status: 'published',
          expectedSectionCount: 1,
          publishedAt: new Date('2026-01-01'),
          entries: [
            {
              sectionId: 'section-overview',
              section: {
                name: 'The project',
                sortOrder: 0,
                archivedAt: new Date('2026-02-01'),
              },
              clientSectionContent: { structuredContent: [{ text: 'Gone' }] },
            },
          ],
        },
      });

      await expect(service.readPublicSections('project')).resolves.toEqual([]);
    });

    it('reads nothing for a project that has never published', async () => {
      const { prisma, service } = setup();
      prisma.projectClientPublication.findUnique.mockResolvedValue(null);

      await expect(service.readPublicSections('project')).resolves.toEqual([]);
    });

    it('keeps a release being assembled out of what the client reads', async () => {
      const { prisma, service } = setup();
      prisma.projectClientPublication.findUnique.mockResolvedValue(null);
      prisma.clientContentRelease.findFirst.mockResolvedValue({
        id: 'pending',
        sequence: 3,
        status: 'preparing',
        expectedSectionCount: 2,
        entries: [
          {
            sectionId: 'section-overview',
            section: { name: 'The project', sortOrder: 0, archivedAt: null },
            clientSectionContent: { structuredContent: [{ text: 'Draft' }] },
          },
        ],
      });

      const preview = (await service.readPreview('project')) as {
        current: { visibleToClient: boolean };
        pending: { visibleToClient: boolean; readySectionCount: number };
      };

      expect(preview.current.visibleToClient).toBe(false);
      expect(preview.pending.visibleToClient).toBe(false);
      expect(preview.pending.readySectionCount).toBe(1);
    });
  });

  // A release that loses the swap for the head is dropped, and its section goes
  // with it: approved by the contributor, never seen by the client.
  describe('recovering a section dropped by a lost swap', () => {
    function droppedRelease(sectionId: string) {
      return [
        {
          id: 'dropped',
          projectId: 'project',
          initiatingProposal: { ...proposal, sectionId },
        },
      ] as never;
    }

    it('re-queues a section the client never received', async () => {
      const { prisma, service } = setup();
      prisma.clientContentRelease.findMany.mockResolvedValue(
        droppedRelease('section-planning'),
      );
      prisma.clientContentRelease.count.mockResolvedValue(0);
      prisma.projectClientPublication.findUnique.mockResolvedValue({
        currentRelease: { entries: [{ sectionId: 'section-overview' }] },
      });
      const queue = jest
        .spyOn(service, 'queueApprovedProposal')
        .mockResolvedValue('release');

      await service.recoverDroppedAcceptances();

      expect(queue).toHaveBeenCalledWith(
        expect.objectContaining({ sectionId: 'section-planning' }),
      );
    });

    it('leaves a section the client already has alone', async () => {
      const { prisma, service } = setup();
      prisma.clientContentRelease.findMany.mockResolvedValue(
        droppedRelease('section-overview'),
      );
      prisma.clientContentRelease.count.mockResolvedValue(0);
      prisma.projectClientPublication.findUnique.mockResolvedValue({
        currentRelease: { entries: [{ sectionId: 'section-overview' }] },
      });
      const queue = jest
        .spyOn(service, 'queueApprovedProposal')
        .mockResolvedValue('release');

      await service.recoverDroppedAcceptances();

      expect(queue).not.toHaveBeenCalled();
    });

    // A release still being assembled is a publication attempt. Without this
    // the sweep queued another every thirty seconds — thirteen releases and
    // twelve generation calls — because the section could not appear until the
    // attempt already running had finished.
    it('waits for an attempt in flight instead of starting another', async () => {
      const { prisma, service } = setup();
      prisma.clientContentRelease.findMany.mockResolvedValue(
        droppedRelease('section-planning'),
      );
      prisma.clientContentRelease.count.mockResolvedValue(1);
      const queue = jest
        .spyOn(service, 'queueApprovedProposal')
        .mockResolvedValue('release');

      await service.recoverDroppedAcceptances();

      expect(queue).not.toHaveBeenCalled();
    });
  });

  // The renderer should not have to consult the section list to know what it is
  // holding, and where the project stands is read live off the section rather
  // than baked into a release nobody republished.
  it('serves a roadmap as milestones, with the position the developer set', async () => {
    const { prisma, service } = setup();
    prisma.projectClientPublication.findUnique.mockResolvedValue({
      currentRelease: {
        id: 'release',
        sequence: 1,
        status: 'published',
        expectedSectionCount: 1,
        publishedAt: new Date('2026-01-01'),
        entries: [
          {
            sectionId: 'section-roadmap',
            section: {
              name: 'Roadmap',
              kind: 'roadmap',
              currentMilestoneId: 'milestone-2',
              sortOrder: 0,
              archivedAt: null,
            },
            clientSectionContent: {
              structuredContent: [{ id: 'milestone-2', title: 'Recette' }],
            },
          },
        ],
      },
    });

    await expect(service.readPublicSections('project')).resolves.toEqual([
      {
        id: 'section-roadmap',
        name: 'Roadmap',
        kind: 'roadmap',
        milestones: [{ id: 'milestone-2', title: 'Recette' }],
        currentMilestoneId: 'milestone-2',
      },
    ]);
  });

  // FR-023 applied to a roadmap: a frise with no milestones is a section with
  // no published content, and one of those is absent rather than a blank tab.
  it('leaves an empty roadmap out of the client tabs entirely', async () => {
    const { prisma, service } = setup();
    prisma.projectClientPublication.findUnique.mockResolvedValue({
      currentRelease: {
        id: 'release',
        sequence: 1,
        status: 'published',
        expectedSectionCount: 1,
        publishedAt: new Date('2026-01-01'),
        entries: [
          {
            sectionId: 'section-roadmap',
            section: {
              name: 'Roadmap',
              kind: 'roadmap',
              currentMilestoneId: null,
              sortOrder: 0,
              archivedAt: null,
            },
            clientSectionContent: { structuredContent: [] },
          },
        ],
      },
    });

    await expect(service.readPublicSections('project')).resolves.toEqual([]);
  });
});
