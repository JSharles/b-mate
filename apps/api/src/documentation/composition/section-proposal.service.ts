import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { GenerationService } from '../../generation/generation.service';
import { ClientPublicationService } from '../publication/client-publication.service';
import {
  SECTION_COMPOSITION_OUTPUT_CONTRACT,
  SECTION_COMPOSITION_PROMPT_VERSION,
} from './composition-output.schema';
import {
  ROADMAP_COMPOSITION_OUTPUT_CONTRACT,
  ROADMAP_COMPOSITION_PROMPT_VERSION,
} from './roadmap-output.schema';
import { compositionFingerprint } from './section-composition.handler';

// Every id a roadmap holds, at both levels. Where the project stands may name
// a milestone or one of its sub-steps, so anything checking "does this id still
// exist" has to walk the whole tree.
export function milestoneIds(structuredContent: unknown): Set<string> {
  const milestones = (structuredContent ?? []) as {
    id?: string;
    substeps?: { id?: string }[];
  }[];
  return new Set(
    milestones
      .flatMap((milestone) => [
        milestone.id,
        ...(milestone.substeps ?? []).map((substep) => substep.id),
      ])
      .filter((id): id is string => typeof id === 'string'),
  );
}

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
      sectionKind: section.kind,
      sectionName: section.name,
      instructions: section.instructions,
      referenceDocumentId: reference.id,
      referenceVersion: reference.version,
    });

    const roadmap = section.kind === 'roadmap';

    const attempts = await this.prisma.sectionProposal.count({
      where: { sectionId: section.id },
    });

    return this.prisma.$transaction(async (tx) => {
      const operation = await this.generation.createInTransaction(tx, {
        projectId,
        type: 'section_composition',
        deduplicationKey: `composition:${projectId}:${section.id}:${reference.id}:${attempts}`,
        inputFingerprint,
        promptVersion: roadmap
          ? ROADMAP_COMPOSITION_PROMPT_VERSION
          : SECTION_COMPOSITION_PROMPT_VERSION,
        outputContractVersion: roadmap
          ? ROADMAP_COMPOSITION_OUTPUT_CONTRACT
          : SECTION_COMPOSITION_OUTPUT_CONTRACT,
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
      include: { section: { select: { kind: true } } },
    });
    if (!proposal) return null;

    // Content stays empty until there is something to review, so a client of
    // this route cannot mistake "still composing" for "composed nothing".
    const readable =
      proposal.status === 'pending_review' || proposal.status === 'approved';
    const content = readable
      ? ((proposal.structuredContent ?? []) as unknown[])
      : [];
    const roadmap = proposal.section.kind === 'roadmap';

    return {
      id: proposal.id,
      sectionId: proposal.sectionId,
      referenceDocumentId: proposal.referenceDocumentId,
      status: proposal.status,
      outcome: proposal.outcome,
      version: proposal.version,
      changeSummary: proposal.changeSummary,
      createdAt: proposal.createdAt.toISOString(),
      // One of the two is always empty: the section's kind decides which, and it
      // cannot change once the section exists.
      blocks: roadmap ? [] : content,
      milestones: roadmap ? content : [],
      failureCode: proposal.failureCode,
    };
  }

  // The developer's edits land on the proposal they are reviewing, not on a
  // regeneration: a wrong date is fixed by fixing it, not by writing a note and
  // asking for the whole roadmap again.
  //
  // Every milestone travels, in order, so the result is never a function of
  // what the server already held. An id names one being kept; its absence means
  // a new one, which is why a new milestone can never collide with an existing
  // id or silently overwrite one.
  async replaceMilestones(
    userId: string,
    projectId: string,
    sectionId: string,
    input: {
      milestones: {
        id?: string | null;
        when?: string | null;
        title: string;
        description?: string | null;
        substeps?: {
          id?: string | null;
          when?: string | null;
          title: string;
          description?: string | null;
        }[];
      }[];
      expectedProposalVersion: number;
    },
  ) {
    await this.access.requireContributor(userId, projectId);
    const section = await this.prisma.clientSection.findFirst({
      where: { id: sectionId, projectId, archivedAt: null },
      select: { id: true, kind: true, activeProposalId: true },
    });
    if (!section) throw new NotFoundException({ code: 'NOT_FOUND' });
    if (section.kind !== 'roadmap') {
      throw new BadRequestException({ code: 'SECTION_NOT_ROADMAP' });
    }
    if (!section.activeProposalId) {
      throw new NotFoundException({ code: 'NOT_FOUND' });
    }

    const held = await this.prisma.sectionProposal.findUnique({
      where: { id: section.activeProposalId },
      select: { id: true, status: true, structuredContent: true },
    });
    // A composition still running will overwrite whatever is written here the
    // moment it lands, so the edit is refused rather than lost.
    if (!held || held.status !== 'pending_review') {
      throw new ConflictException({ code: 'PROPOSAL_STALE' });
    }

    // Both levels are reconciled against what was held, so a correction to a
    // sub-step keeps its id and its origin exactly as a correction to the
    // milestone above it does.
    const previous = (held.structuredContent ?? []) as {
      id: string;
      origin: string;
      substeps?: { id: string; origin: string }[];
    }[];
    const existing = new Map(
      previous.map((milestone) => [milestone.id, milestone]),
    );
    const existingSubsteps = new Map(
      previous.flatMap((milestone) =>
        (milestone.substeps ?? []).map(
          (substep) => [substep.id, substep] as const,
        ),
      ),
    );

    const milestones = input.milestones.map((milestone) => {
      const kept = milestone.id ? existing.get(milestone.id) : undefined;
      return {
        id: kept?.id ?? randomUUID(),
        when: milestone.when?.trim() ? milestone.when.trim() : null,
        title: milestone.title.trim(),
        description: milestone.description?.trim()
          ? milestone.description.trim()
          : null,
        substeps: (milestone.substeps ?? []).map((substep) => {
          const keptSubstep = substep.id
            ? existingSubsteps.get(substep.id)
            : undefined;
          return {
            id: keptSubstep?.id ?? randomUUID(),
            // A step inside a phase often has no date of its own, and an empty
            // field is that answer rather than a blank string.
            when: substep.when?.trim() ? substep.when.trim() : null,
            title: substep.title.trim(),
            description: substep.description?.trim()
              ? substep.description.trim()
              : null,
            origin: keptSubstep ? keptSubstep.origin : ('developer' as const),
          };
        }),
        // A milestone read from the documents stays one even after its wording
        // is corrected: the developer is fixing what was read, not authoring a
        // step of their own. Anything with no id behind it is theirs.
        origin: kept ? kept.origin : ('developer' as const),
      };
    });

    const { count } = await this.prisma.sectionProposal.updateMany({
      where: {
        id: held.id,
        status: 'pending_review',
        version: input.expectedProposalVersion,
      },
      data: {
        structuredContent: milestones,
        // A roadmap the developer filled in by hand has composed something,
        // whatever the model found.
        outcome: milestones.length > 0 ? 'composed' : 'nothing_matched',
        version: { increment: 1 },
      },
    });
    if (count === 0) throw new ConflictException({ code: 'PROPOSAL_STALE' });

    return this.current(userId, projectId, sectionId);
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
      select: { id: true, kind: true, activeProposalId: true },
    });
    if (!section?.activeProposalId) {
      throw new NotFoundException({ code: 'NOT_FOUND' });
    }

    // Publishing an empty roadmap gives the client a tab with nothing in it and
    // no way to know why. A roadmap that found nothing is a starting point, not
    // something to approve — the developer fills it in first.
    if (section.kind === 'roadmap') {
      const held = await this.prisma.sectionProposal.findUnique({
        where: { id: section.activeProposalId },
        select: { structuredContent: true },
      });
      const milestones = (held?.structuredContent ?? []) as unknown[];
      if (milestones.length === 0) {
        throw new BadRequestException({ code: 'ROADMAP_EMPTY' });
      }
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

    await this.dropCurrentMilestoneIfGone(
      sectionId,
      approved.structuredContent,
    );
    // FR-022: publication replaces the whole set, so the client never reads a
    // mixture of approved and unapproved sections.
    const releaseId = await this.publication.queueApprovedProposal(approved);

    return {
      proposalId: section.activeProposalId,
      releaseId,
      approved: true as const,
    };
  }

  // Where the project stands survives a regeneration, because it has nothing to
  // do with what the documents say. What it cannot survive is the milestone it
  // names disappearing — then the honest answer is that no position is claimed.
  private async dropCurrentMilestoneIfGone(
    sectionId: string,
    structuredContent: unknown,
  ) {
    // Walked at both levels: the position may name a sub-step, and a sub-step
    // that disappears leaves the section pointing at nothing just as a
    // milestone does.
    const ids = milestoneIds(structuredContent);
    const section = await this.prisma.clientSection.findUnique({
      where: { id: sectionId },
      select: { currentMilestoneId: true },
    });
    if (!section?.currentMilestoneId) return;
    if (ids.has(section.currentMilestoneId)) return;
    await this.prisma.clientSection.update({
      where: { id: sectionId },
      data: { currentMilestoneId: null, version: { increment: 1 } },
    });
  }
}
