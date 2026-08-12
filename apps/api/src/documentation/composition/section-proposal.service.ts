import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { GenerationService } from '../../generation/generation.service';
import {
  SECTION_COMPOSITION_OUTPUT_CONTRACT,
  SECTION_COMPOSITION_PROMPT_VERSION,
} from './composition-output.schema';
import {
  compositionFingerprint,
  selectCompositionStatements,
} from './section-composition.handler';

// The states a proposal can still move out of. A section holding one of these
// is busy; anything else has released it.
const LIVE_PROPOSAL_STATUSES = ['composing', 'pending_review'] as const;

@Injectable()
export class SectionProposalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly generation: GenerationService,
  ) {}

  async compose(userId: string, projectId: string, sectionId: string) {
    await this.access.requireContributor(userId, projectId);

    const section = await this.prisma.clientSection.findFirst({
      where: { id: sectionId, projectId, archivedAt: null },
    });
    if (!section) throw new NotFoundException({ code: 'NOT_FOUND' });

    // FR-013. Checked here for a usable error, and refused again by the unique
    // constraint on `activeProposalId` below if two callers get this far at once.
    if (section.activeProposalId) {
      const held = await this.prisma.sectionProposal.findFirst({
        where: {
          id: section.activeProposalId,
          status: { in: [...LIVE_PROPOSAL_STATUSES] },
        },
        select: { id: true },
      });
      if (held) throw new ConflictException({ code: 'SECTION_COMPOSING' });
    }

    const source = await this.prisma.projectSource.findUnique({
      where: { projectId },
      select: { currentRevisionId: true },
    });
    if (!source?.currentRevisionId) {
      throw new BadRequestException({ code: 'NO_CANONICAL_CONTENT' });
    }
    const items = await this.prisma.sourceRevisionItem.findMany({
      where: { sourceRevisionId: source.currentRevisionId },
      orderBy: { sortOrder: 'asc' },
    });
    if (items.length === 0) {
      throw new BadRequestException({ code: 'NO_CANONICAL_CONTENT' });
    }

    // Exclusions arrive in US2. Reading them through one helper now means the
    // fingerprint and the prompt cannot later disagree about what was sent.
    const statements = selectCompositionStatements(items);
    const inputFingerprint = compositionFingerprint({
      sectionId: section.id,
      sectionName: section.name,
      instructions: section.instructions,
      sourceRevisionId: source.currentRevisionId,
      statements,
    });

    const attempts = await this.prisma.sectionProposal.count({
      where: { sectionId: section.id },
    });

    return this.prisma.$transaction(async (tx) => {
      const operation = await this.generation.createInTransaction(tx, {
        projectId,
        type: 'section_composition',
        deduplicationKey: `composition:${projectId}:${section.id}:${source.currentRevisionId}:${attempts}`,
        inputFingerprint,
        promptVersion: SECTION_COMPOSITION_PROMPT_VERSION,
        outputContractVersion: SECTION_COMPOSITION_OUTPUT_CONTRACT,
        sourceRevisionId: source.currentRevisionId!,
      });
      const proposal = await tx.sectionProposal.create({
        data: {
          sectionId: section.id,
          sourceRevisionId: source.currentRevisionId!,
          generationOperationId: operation.id,
          status: 'composing',
        },
      });
      // Claiming the slot only from a section that still holds none is what
      // makes two simultaneous triggers produce one composition rather than two.
      const claimed = await tx.clientSection.updateMany({
        where: { id: section.id, activeProposalId: null, archivedAt: null },
        data: { activeProposalId: proposal.id, version: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        throw new ConflictException({ code: 'SECTION_COMPOSING' });
      }
      return { proposalId: proposal.id, operationId: operation.id };
    });
  }

  async current(userId: string, projectId: string, sectionId: string) {
    await this.access.requireContributor(userId, projectId);
    const section = await this.prisma.clientSection.findFirst({
      where: { id: sectionId, projectId, archivedAt: null },
      select: { id: true },
    });
    if (!section) throw new NotFoundException({ code: 'NOT_FOUND' });

    const proposal = await this.prisma.sectionProposal.findFirst({
      where: { sectionId },
      include: { questions: { include: { items: true } } },
      orderBy: { createdAt: 'desc' },
    });
    if (!proposal) return null;

    return {
      id: proposal.id,
      sectionId: proposal.sectionId,
      sourceRevisionId: proposal.sourceRevisionId,
      status: proposal.status,
      outcome: proposal.outcome,
      version: proposal.version,
      changeSummary: proposal.changeSummary,
      createdAt: proposal.createdAt.toISOString(),
      // Blocks stay null until there is something to review, so a client of
      // this route cannot mistake "still composing" for "composed nothing".
      blocks:
        proposal.status === 'pending_review' || proposal.status === 'approved'
          ? ((proposal.structuredContent ?? []) as unknown[])
          : [],
      questions: proposal.questions.map((question) => ({
        id: question.id,
        question: question.question,
        impactExplanation: question.impactExplanation,
        relatedInformationItemIds: question.items.map(
          ({ informationItemId }) => informationItemId,
        ),
        answeredByAssertionId: question.answeredByAssertionId,
      })),
      provenanceSummary: (proposal.provenanceSummary ?? []) as unknown[],
      failureCode: proposal.failureCode,
    };
  }

  async approve(
    userId: string,
    projectId: string,
    sectionId: string,
    expectedVersion: number,
  ) {
    await this.access.requireContributor(userId, projectId);
    const section = await this.prisma.clientSection.findFirst({
      where: { id: sectionId, projectId, archivedAt: null },
      select: { id: true, activeProposalId: true },
    });
    if (!section?.activeProposalId) {
      throw new NotFoundException({ code: 'NOT_FOUND' });
    }

    // FR-012: only a proposal the contributor has actually read can be
    // approved, and only at the version they read.
    const { count } = await this.prisma.sectionProposal.updateMany({
      where: {
        id: section.activeProposalId,
        sectionId,
        status: 'pending_review',
        version: expectedVersion,
      },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedByUserId: userId,
        version: { increment: 1 },
      },
    });
    if (count === 0) throw new ConflictException({ code: 'PROPOSAL_STALE' });

    // Approving releases the slot: the section is free to be refreshed, and its
    // approved proposal is what publication reads.
    await this.prisma.clientSection.updateMany({
      where: { id: sectionId, activeProposalId: section.activeProposalId },
      data: { activeProposalId: null, version: { increment: 1 } },
    });

    return { proposalId: section.activeProposalId, approved: true as const };
  }
}
