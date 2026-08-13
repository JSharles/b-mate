import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { GenerationService } from '../../generation/generation.service';
import { ClientPublicationService } from '../publication/client-publication.service';
import {
  SECTION_COMPOSITION_OUTPUT_CONTRACT,
  SECTION_COMPOSITION_PROMPT_VERSION,
} from './composition-output.schema';
import { compositionFingerprint } from './section-composition.handler';

// The states a proposal can still move out of. A section holding one of these
// is busy; anything else has released it.
const LIVE_PROPOSAL_STATUSES = ['composing', 'pending_review'] as const;

const FALLBACK_LOCALE = 'en';

@Injectable()
export class SectionProposalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly generation: GenerationService,
    private readonly publication: ClientPublicationService,
  ) {}

  async compose(
    userId: string,
    projectId: string,
    sectionId: string,
    locale: string | null = null,
  ) {
    await this.access.requireContributor(userId, projectId);

    const section = await this.prisma.clientSection.findFirst({
      where: { id: sectionId, projectId, archivedAt: null },
    });
    if (!section) throw new NotFoundException({ code: 'NOT_FOUND' });

    // FR-013 is about two compositions at once, not about a deliberate second
    // go. A run already in flight is refused — asking twice pays twice — and
    // the unique constraint on `activeProposalId` refuses it again if two
    // callers get this far together. A proposal merely waiting to be read is
    // not in the way: pressing "write it" on one is the developer saying they
    // want another. Refusing that silently is what made the button look broken.
    if (section.activeProposalId) {
      const held = await this.prisma.sectionProposal.findFirst({
        where: {
          id: section.activeProposalId,
          status: { in: [...LIVE_PROPOSAL_STATUSES] },
        },
        select: { id: true, status: true },
      });
      if (held?.status === 'composing') {
        throw new ConflictException({ code: 'SECTION_COMPOSING' });
      }
      if (held) await this.supersede(sectionId, held.id);
    }

    // A section is a view of the reference document, so there is nothing to
    // compose before one exists. Said plainly rather than failed downstream:
    // this is a real ordering constraint, not an error (plan, Decision 4).
    const reference = await this.prisma.referenceDocument.findFirst({
      where: { projectId, status: 'ready', outcome: 'written' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, version: true },
    });
    if (!reference) {
      throw new BadRequestException({ code: 'NO_REFERENCE_DOCUMENT' });
    }

    const inputFingerprint = compositionFingerprint({
      locale: locale ?? FALLBACK_LOCALE,
      sectionId: section.id,
      sectionName: section.name,
      instructions: section.instructions,
      referenceDocumentId: reference.id,
      referenceVersion: reference.version,
    });

    const attempts = await this.prisma.sectionProposal.count({
      where: { sectionId: section.id },
    });

    return this.prisma.$transaction(async (tx) => {
      const operation = await this.generation.createInTransaction(tx, {
        projectId,
        type: 'section_composition',
        deduplicationKey: `composition:${projectId}:${section.id}:${reference.id}:${attempts}`,
        inputFingerprint,
        promptVersion: SECTION_COMPOSITION_PROMPT_VERSION,
        outputContractVersion: SECTION_COMPOSITION_OUTPUT_CONTRACT,
      });
      const proposal = await tx.sectionProposal.create({
        data: {
          sectionId: section.id,
          referenceDocumentId: reference.id,
          locale: locale ?? FALLBACK_LOCALE,
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

  // Revising a section makes whatever it is holding obsolete: a proposal under
  // review was written for a brief that no longer exists, and a composition
  // still running is writing for it right now. Without this, editing a section
  // that had just been written did nothing at all — the slot was taken, the
  // conflict was swallowed, and the developer got a toast and no work.
  async releaseForRevision(projectId: string, sectionId: string) {
    const section = await this.prisma.clientSection.findFirst({
      where: { id: sectionId, projectId, archivedAt: null },
      select: { activeProposalId: true },
    });
    if (!section?.activeProposalId) return;

    const held = await this.prisma.sectionProposal.findFirst({
      where: {
        id: section.activeProposalId,
        status: { in: [...LIVE_PROPOSAL_STATUSES] },
      },
      select: { id: true, status: true, generationOperationId: true },
    });
    if (!held) return;

    // Stop the remote work before releasing the slot. Released first, the run
    // in flight could still land on a proposal the section had moved past.
    if (held.status === 'composing') {
      await this.generation.cancel(held.generationOperationId);
    }
    await this.supersede(sectionId, held.id);
  }

  // Retires a proposal and hands its section the slot back, both guarded on
  // what they still hold so a concurrent release cannot undo a newer one.
  private async supersede(sectionId: string, proposalId: string) {
    await this.prisma.sectionProposal.updateMany({
      where: { id: proposalId, status: { in: [...LIVE_PROPOSAL_STATUSES] } },
      data: { status: 'superseded', version: { increment: 1 } },
    });
    await this.prisma.clientSection.updateMany({
      where: { id: sectionId, activeProposalId: proposalId },
      data: { activeProposalId: null, version: { increment: 1 } },
    });
  }

  // A proposal is owned by its section, not by the operation that happened to
  // produce it. Re-running the dead operation would make a second one with no
  // proposal behind it, which could only fail — so a retry goes through the
  // section, which knows what still needs composing.
  async retryComposition(
    userId: string,
    projectId: string,
    operationId: string,
  ) {
    const proposal = await this.prisma.sectionProposal.findFirst({
      where: { generationOperationId: operationId, section: { projectId } },
      select: { sectionId: true, locale: true },
    });
    if (!proposal) return null;
    return this.compose(userId, projectId, proposal.sectionId, proposal.locale);
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
      orderBy: { createdAt: 'desc' },
    });
    if (!proposal) return null;

    return {
      id: proposal.id,
      sectionId: proposal.sectionId,
      referenceDocumentId: proposal.referenceDocumentId,
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

    const approved = await this.prisma.sectionProposal.findUnique({
      where: { id: section.activeProposalId },
    });
    if (!approved) throw new NotFoundException({ code: 'NOT_FOUND' });
    // FR-022: publication replaces the whole set, so the client never reads a
    // mixture of approved and unapproved sections.
    const releaseId = await this.publication.queueApprovedProposal(approved);

    return {
      proposalId: section.activeProposalId,
      releaseId,
      approved: true as const,
    };
  }
}
