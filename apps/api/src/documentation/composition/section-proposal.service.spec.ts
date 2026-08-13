import { NotFoundException } from '@nestjs/common';
import { GenerationService } from '../../generation/generation.service';
import { ClientPublicationService } from '../publication/client-publication.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { SectionProposalService } from './section-proposal.service';

const projectId = '00000000-0000-4000-8000-000000000001';
const sectionId = '00000000-0000-4000-8000-000000000002';
const proposalId = '00000000-0000-4000-8000-000000000003';
const referenceId = '00000000-0000-4000-8000-000000000004';
const operationId = '00000000-0000-4000-8000-000000000005';
const userId = 'user-1';

const section = {
  id: sectionId,
  projectId,
  name: 'What the client asked for',
  instructions: 'The request and its constraints.',
  activeProposalId: null,
  archivedAt: null,
};

const reference = { id: referenceId, version: 1 };

describe('SectionProposalService', () => {
  function setup() {
    const prisma = createPrismaMock();
    const access = {
      requireContributor: jest.fn().mockResolvedValue({ role: 'contributor' }),
    };
    const generation = {
      createInTransaction: jest.fn().mockResolvedValue({ id: operationId }),
    };
    const publication = {
      queueApprovedProposal: jest.fn().mockResolvedValue('release-1'),
    };
    return {
      prisma,
      access,
      generation,
      publication,
      service: new SectionProposalService(
        asPrismaService(prisma),
        access as unknown as ProjectAccessService,
        generation as unknown as GenerationService,
        publication as unknown as ClientPublicationService,
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
    prisma.referenceDocument.findFirst.mockResolvedValue(reference);
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
        expect.objectContaining({ type: 'section_composition' }),
      );
      expect(prisma.clientSection.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ activeProposalId: null }),
          data: expect.objectContaining({ activeProposalId: proposalId }),
        }),
      );
    });

    it('pins the proposal to the reference document it composes from', async () => {
      const { prisma, service } = setup();
      readyToCompose(prisma);

      await service.compose(userId, projectId, sectionId);

      expect(prisma.sectionProposal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            referenceDocumentId: referenceId,
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

    // Plan, Decision 4: a section is a view of the reference document, so this
    // is a real ordering constraint rather than a failure.
    it('refuses to compose before a reference document exists', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findFirst.mockResolvedValue(section);
      prisma.referenceDocument.findFirst.mockResolvedValue(null);

      await expect(
        service.compose(userId, projectId, sectionId),
      ).rejects.toMatchObject({ response: { code: 'NO_REFERENCE_DOCUMENT' } });
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
        referenceDocumentId: referenceId,
        status: 'composing',
        outcome: null,
        version: 1,
        changeSummary: null,
        createdAt: new Date('2026-08-12T10:00:00.000Z'),
        structuredContent: null,
        failureCode: null,
        questions: [],
      });

      await expect(
        service.current(userId, projectId, sectionId),
      ).resolves.toMatchObject({ status: 'composing', blocks: [] });
    });

    it('returns the content once it awaits review', async () => {
      const { prisma, service } = setup();
      prisma.clientSection.findFirst.mockResolvedValue({ id: sectionId });
      prisma.sectionProposal.findFirst.mockResolvedValue({
        id: proposalId,
        sectionId,
        referenceDocumentId: referenceId,
        status: 'pending_review',
        outcome: 'composed',
        version: 2,
        changeSummary: 'First composition.',
        createdAt: new Date('2026-08-12T10:00:00.000Z'),
        structuredContent: [{ kind: 'paragraph', text: 'A paragraph.' }],
        failureCode: null,
      });

      const proposal = await service.current(userId, projectId, sectionId);

      expect(proposal?.blocks).toHaveLength(1);
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
      prisma.sectionProposal.findUnique.mockResolvedValue({ id: proposalId });

      await expect(
        service.approve(userId, projectId, sectionId, 2),
      ).resolves.toEqual({
        proposalId,
        releaseId: 'release-1',
        approved: true,
      });

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
