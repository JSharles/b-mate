import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { SectionProposal } from '@prisma/client';
import { createHash } from 'node:crypto';
import { GenerationService } from '../../generation/generation.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CLIENT_DERIVATION_OUTPUT_CONTRACT,
  CLIENT_DERIVATION_PROMPT_VERSION,
  ROADMAP_DERIVATION_OUTPUT_CONTRACT,
  ROADMAP_DERIVATION_PROMPT_VERSION,
} from './prompts/client-derivation.prompt';

// How often to look for a section a contributor approved that never reached
// the client, and how long a dropped release must sit before it counts as
// forgotten rather than as a swap still being resolved.
const DROPPED_ACCEPTANCE_SWEEP_MS = 30_000;
const DROPPED_ACCEPTANCE_AFTER_MS = 120_000;

// What the client receives, discriminated by kind rather than inferred from
// which key is present: the renderer should not have to consult the section
// list to know what it is holding.
//
// `currentMilestoneId` is read live off the section rather than baked into the
// release, because the developer moves it without composing, approving or
// publishing anything (specs/020 FR-007).
function publicSection(entry: {
  sectionId: string;
  section: {
    name: string;
    kind: 'prose' | 'roadmap';
    currentMilestoneId: string | null;
  };
  clientSectionContent: { structuredContent: unknown };
}) {
  const identity = { id: entry.sectionId, name: entry.section.name };
  if (entry.section.kind === 'roadmap') {
    return {
      ...identity,
      kind: 'roadmap' as const,
      milestones: entry.clientSectionContent.structuredContent,
      currentMilestoneId: entry.section.currentMilestoneId,
    };
  }
  return {
    ...identity,
    kind: 'prose' as const,
    blocks: entry.clientSectionContent.structuredContent,
  };
}

@Injectable()
export class ClientPublicationService {
  private readonly logger = new Logger(ClientPublicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: GenerationService,
  ) {}

  // A release that loses the swap for the head is dropped, and its section goes
  // with it — approved by the contributor, never seen by the client. The swap is
  // what stops two half-releases going live; this is what stops the losing half
  // from being forgotten. Coverage is judged by section, so a section showing
  // older content than the proposal that was approved is not caught here.
  @Interval(DROPPED_ACCEPTANCE_SWEEP_MS)
  async recoverDroppedAcceptances(): Promise<void> {
    const settledBefore = new Date(Date.now() - DROPPED_ACCEPTANCE_AFTER_MS);
    const dropped = await this.prisma.clientContentRelease.findMany({
      where: {
        status: 'superseded',
        publishedAt: null,
        updatedAt: { lt: settledBefore },
      },
      include: { initiatingProposal: true },
    });
    for (const release of dropped) {
      const proposal = release.initiatingProposal;
      if (!proposal?.approvedByUserId) continue;
      // A release still being assembled *is* a publication attempt. Without
      // this the sweep queued another one every thirty seconds — thirteen
      // releases and twelve generation calls before I stopped it — because the
      // section it was recovering could not appear until the attempt already
      // running had finished.
      const inFlight = await this.prisma.clientContentRelease.count({
        where: { projectId: release.projectId, status: 'preparing' },
      });
      if (inFlight > 0) continue;
      const publication = await this.prisma.projectClientPublication.findUnique(
        {
          where: { projectId: release.projectId },
          include: { currentRelease: { include: { entries: true } } },
        },
      );
      const covered = publication?.currentRelease?.entries.some(
        (entry) => entry.sectionId === proposal.sectionId,
      );
      if (covered) continue;
      try {
        await this.queueApprovedProposal(proposal);
      } catch (error) {
        this.logger.warn(
          `Could not re-publish section ${proposal.sectionId}: ${String(error)}`,
        );
      }
    }
  }

  // Approving a section queues one release carrying every section the client
  // already reads plus this one, so the swap below replaces a complete set with
  // a complete set. FR-022: the client never reads a mixture.
  async queueApprovedProposal(proposal: SectionProposal): Promise<string> {
    return this.prisma.$transaction(
      async (tx) => {
        const section = await tx.clientSection.findUnique({
          where: { id: proposal.sectionId },
          select: { projectId: true, kind: true },
        });
        if (!section) throw new Error('CLIENT_PUBLICATION_SECTION_MISSING');
        const projectId = section.projectId;

        const publication = await tx.projectClientPublication.upsert({
          where: { projectId },
          update: {},
          create: { projectId },
        });
        const baseEntries = publication.currentReleaseId
          ? await tx.clientContentReleaseEntry.findMany({
              where: { releaseId: publication.currentReleaseId },
            })
          : [];
        // The section being approved is rebuilt from its new proposal; every
        // other section is carried across by reference, so nothing already
        // published is re-derived or re-billed.
        const kept = baseEntries.filter(
          (entry) => entry.sectionId !== proposal.sectionId,
        );
        const release = await tx.clientContentRelease.create({
          data: {
            projectId,
            sequence: publication.nextSequence,
            baseReleaseId: publication.currentReleaseId,
            reason: 'section_approval',
            status: 'preparing',
            expectedSectionCount: kept.length + 1,
            initiatingProposalId: proposal.id,
            entries: {
              create: kept.map((entry) => ({
                sectionId: entry.sectionId,
                locale: entry.locale,
                clientSectionContentId: entry.clientSectionContentId,
              })),
            },
          },
        });
        await tx.projectClientPublication.update({
          where: { projectId },
          data: { nextSequence: { increment: 1 }, version: { increment: 1 } },
        });
        const inputFingerprint = createHash('sha256')
          .update(JSON.stringify({ proposalId: proposal.id, locale: 'fr' }))
          .digest('hex');
        await this.generation.createInTransaction(tx, {
          projectId,
          type: 'client_derivation',
          deduplicationKey: `client:${release.id}:${proposal.sectionId}:fr`,
          inputFingerprint,
          promptVersion:
            section.kind === 'roadmap'
              ? ROADMAP_DERIVATION_PROMPT_VERSION
              : CLIENT_DERIVATION_PROMPT_VERSION,
          outputContractVersion:
            section.kind === 'roadmap'
              ? ROADMAP_DERIVATION_OUTPUT_CONTRACT
              : CLIENT_DERIVATION_OUTPUT_CONTRACT,
          sectionProposalId: proposal.id,
          clientReleaseId: release.id,
        });
        return release.id;
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async readCurrent(projectId: string): Promise<unknown> {
    const publication = await this.prisma.projectClientPublication.findUnique({
      where: { projectId },
      include: {
        currentRelease: {
          include: {
            entries: {
              include: { clientSectionContent: true, section: true },
            },
          },
        },
      },
    });
    const release = publication?.currentRelease;
    return {
      releaseId: release?.id ?? null,
      sequence: release?.sequence ?? 0,
      status: release?.status ?? null,
      visibleToClient: Boolean(release),
      readySectionCount: release?.entries.length ?? 0,
      expectedSectionCount: release?.expectedSectionCount ?? 0,
      // FR-023: an archived section stops being readable without republishing,
      // and the contributor's order is what the client reads.
      sections:
        release?.entries
          .filter((entry) => !entry.section.archivedAt)
          .sort((a, b) => a.section.sortOrder - b.section.sortOrder)
          .map((entry) => publicSection(entry)) ?? [],
      publishedAt: release?.publishedAt?.toISOString() ?? null,
    };
  }

  async readPublicSections(projectId: string): Promise<unknown[]> {
    const view = (await this.readCurrent(projectId)) as { sections: unknown[] };
    return view.sections;
  }

  async readPreview(projectId: string): Promise<unknown> {
    const current = await this.readCurrent(projectId);
    const pending = await this.prisma.clientContentRelease.findFirst({
      where: {
        projectId,
        status: { in: ['queued', 'preparing', 'validating', 'ready'] },
      },
      orderBy: { sequence: 'desc' },
      include: {
        entries: { include: { clientSectionContent: true, section: true } },
      },
    });
    return {
      current,
      pending: pending
        ? {
            releaseId: pending.id,
            sequence: pending.sequence,
            status: pending.status,
            visibleToClient: false,
            readySectionCount: pending.entries.length,
            expectedSectionCount: pending.expectedSectionCount,
            sections: pending.entries.map((entry) => publicSection(entry)),
            publishedAt: null,
          }
        : null,
    };
  }
}
