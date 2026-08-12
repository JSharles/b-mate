import { NotFoundException } from '@nestjs/common';
import { GenerationService } from '../../generation/generation.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { SectionProposalService } from './section-proposal.service';

const projectId = '00000000-0000-4000-8000-000000000001';
const sectionId = '00000000-0000-4000-8000-000000000002';
const proposalId = '00000000-0000-4000-8000-000000000003';
const revisionId = '00000000-0000-4000-8000-000000000004';
const operationId = '00000000-0000-4000-8000-000000000005';
const itemA = '00000000-0000-4000-8000-00000000000a';
const userId = 'user-1';

const section = {
  id: sectionId,
  projectId,
  name: 'What the client asked for',
  instructions: 'The request and its constraints.',
  activeProposalId: null,
  archivedAt: null,
};

const items = [
  {
    informationItemId: itemA,
    kind: 'fact',
    state: 'confirmed',
    content: 'The launch is planned for October.',
    sortOrder: 0,
  },
];

describe('SectionProposalService', () => {
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
      service: new SectionProposalService(
        asPrismaService(prisma),
        access as unknown as ProjectAccessService,
        generation as unknown as GenerationService,
      ),
    };
  }

  function readyToCompose(
    prisma: ReturnType<typeof createPrismaMock>,
    overrides: Record<string, unknown> = {},
  ) {
    prisma.clientSection.findFirst.mockResolvedValue({
      ...section,
      ...overrides,
    });
    prisma.projectSource.findUnique.mockResolvedValue({
      currentRevisionId: revisionId,
    });
    prisma.sourceRevisionItem.findMany.mockResolvedValue(items);
    prisma.sectionProposal.count.mockResolvedValue(0);
    prisma.sectionProposal.create.mockResolvedValue({ id: proposalId });
    prisma.clientSection.updateMany.mockResolvedValue({ count: 1 });
  }

  describe('triggering a composition', () => {
    it('queues the work and claims the section slot', async () => {
      const { prisma, generation, service } = setup();
      readyToCompose(prisma);

      await expect(
        service.compose(userId, projectId, sectionId),
      ).resolves.toEqual({ proposalId, operationId });

      expect(generation.createInTransaction).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          type: 'section_composition',
          sourceRevisionId: revisionId,
        }),
      );
      expect(prisma.clientSection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ activeProposalId: null }),
          data: expect.objectContaining({ activeProposalId: proposalId }),
        }),
      );
    });

    it('pins the proposal to the canonical head it composes from', async () => {
      const { prisma, service } = setup();
      readyToCompose(prisma);

      await service.compose(userId, projectId, sectionId);

      expect(prisma.sectionProposal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sourceRevisionId: revisionId,
            status: 'composing',
            generationOperationId: operationId,
          }),
        }),
      );
    });

    it('refuses a second composition while one is running (FR-013)', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findFirst.mockResolvedValue({
        ...section,
        activeProposalId: proposalId,
      });
      prisma.sectionProposal.findFirst.mockResolvedValue({ id: proposalId });

      await expect(
        service.compose(userId, projectId, sectionId),
      ).rejects.toMatchObject({ response: { code: 'SECTION_COMPOSING' } });
      expect(prisma.sectionProposal.create).not.toHaveBeenCalled();
    });

    it('lets a section whose last proposal died compose again', async () => {
      const { prisma, service } = setup();
      readyToCompose(prisma, { activeProposalId: proposalId });
      // The slot points at a proposal that has reached an end, so nothing holds it.
      prisma.sectionProposal.findFirst.mockResolvedValue(null);

      await expect(
        service.compose(userId, projectId, sectionId),
      ).resolves.toMatchObject({ proposalId });
    });

    it('loses the race rather than composing twice', async () => {
      const { prisma, service } = setup();
      readyToCompose(prisma);
      prisma.clientSection.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.compose(userId, projectId, sectionId),
      ).rejects.toMatchObject({ response: { code: 'SECTION_COMPOSING' } });
    });

    it('refuses to compose from an empty canonical source', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findFirst.mockResolvedValue(section);
      prisma.projectSource.findUnique.mockResolvedValue({
        currentRevisionId: revisionId,
      });
      prisma.sourceRevisionItem.findMany.mockResolvedValue([]);

      await expect(
        service.compose(userId, projectId, sectionId),
      ).rejects.toMatchObject({ response: { code: 'NO_CANONICAL_CONTENT' } });
    });

    it('hides a section from another project', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findFirst.mockResolvedValue(null);

      await expect(
        service.compose(userId, projectId, sectionId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reading the current proposal', () => {
    it('withholds blocks while it is still composing', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findFirst.mockResolvedValue({ id: sectionId });
      prisma.sectionProposal.findFirst.mockResolvedValue({
        id: proposalId,
        sectionId,
        sourceRevisionId: revisionId,
        status: 'composing',
        outcome: null,
        version: 1,
        changeSummary: null,
        createdAt: new Date('2026-08-12T10:00:00.000Z'),
        structuredContent: null,
        provenanceSummary: null,
        failureCode: null,
        questions: [],
      });

      await expect(
        service.current(userId, projectId, sectionId),
      ).resolves.toMatchObject({ status: 'composing', blocks: [] });
    });

    it('returns the content and its questions once it awaits review', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findFirst.mockResolvedValue({ id: sectionId });
      prisma.sectionProposal.findFirst.mockResolvedValue({
        id: proposalId,
        sectionId,
        sourceRevisionId: revisionId,
        status: 'pending_review',
        outcome: 'composed',
        version: 2,
        changeSummary: 'First composition.',
        createdAt: new Date('2026-08-12T10:00:00.000Z'),
        structuredContent: [{ type: 'fact', text: 'A fact.' }],
        provenanceSummary: [{ label: 'Brief', itemCount: 1 }],
        failureCode: null,
        questions: [
          {
            id: 'question-1',
            question: 'Is the date confirmed?',
            impactExplanation: 'The client would read an unconfirmed date.',
            answeredByAssertionId: null,
            items: [{ informationItemId: itemA }],
          },
        ],
      });

      const proposal = await service.current(userId, projectId, sectionId);

      expect(proposal?.blocks).toHaveLength(1);
      expect(proposal?.questions[0]).toMatchObject({
        question: 'Is the date confirmed?',
        relatedInformationItemIds: [itemA],
      });
    });

    it('reports a section that has never composed', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findFirst.mockResolvedValue({ id: sectionId });
      prisma.sectionProposal.findFirst.mockResolvedValue(null);

      await expect(
        service.current(userId, projectId, sectionId),
      ).resolves.toBeNull();
    });
  });

  describe('approving', () => {
    it('approves at the version the contributor read, and releases the slot', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findFirst.mockResolvedValue({
        id: sectionId,
        activeProposalId: proposalId,
      });
      prisma.sectionProposal.updateMany.mockResolvedValue({ count: 1 });
      prisma.clientSection.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.approve(userId, projectId, sectionId, 2),
      ).resolves.toEqual({ proposalId, approved: true });

      expect(prisma.sectionProposal.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'pending_review',
            version: 2,
          }),
          data: expect.objectContaining({ approvedByUserId: userId }),
        }),
      );
      expect(prisma.clientSection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ activeProposalId: null }),
        }),
      );
    });

    it('refuses to approve a proposal that has since changed', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findFirst.mockResolvedValue({
        id: sectionId,
        activeProposalId: proposalId,
      });
      prisma.sectionProposal.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.approve(userId, projectId, sectionId, 1),
      ).rejects.toMatchObject({ response: { code: 'PROPOSAL_STALE' } });
      expect(prisma.clientSection.updateMany).not.toHaveBeenCalled();
    });

    it('refuses to approve a section holding no proposal', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findFirst.mockResolvedValue({
        id: sectionId,
        activeProposalId: null,
      });

      await expect(
        service.approve(userId, projectId, sectionId, 1),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
