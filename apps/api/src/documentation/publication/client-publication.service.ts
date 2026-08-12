import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type {
  DocumentationCategoryReference,
  EditorialProfileRevision,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { GenerationService } from '../../generation/generation.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CLIENT_DERIVATION_OUTPUT_CONTRACT,
  CLIENT_DERIVATION_PROMPT_VERSION,
} from './prompts/client-derivation.prompt';

// How often to look for a category a contributor accepted that never reached
// the client, and how long a dropped release must sit before it counts as
// forgotten rather than as a swap still being resolved.
const DROPPED_ACCEPTANCE_SWEEP_MS = 30_000;
const DROPPED_ACCEPTANCE_AFTER_MS = 120_000;

@Injectable()
export class ClientPublicationService {
  private readonly logger = new Logger(ClientPublicationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: GenerationService,
  ) {}

  // A release that loses the swap for the head is dropped, and its category
  // goes with it — accepted by the contributor, never seen by the client. The
  // swap is what stops two half-releases going live; this is what stops the
  // losing half from being forgotten. Coverage is judged by category, so a
  // category showing older content than the reference that was accepted is not
  // caught here.
  @Interval(DROPPED_ACCEPTANCE_SWEEP_MS)
  async recoverDroppedAcceptances(): Promise<void> {
    const settledBefore = new Date(Date.now() - DROPPED_ACCEPTANCE_AFTER_MS);
    const dropped = await this.prisma.clientContentRelease.findMany({
      where: {
        status: 'superseded',
        publishedAt: null,
        updatedAt: { lt: settledBefore },
      },
      include: { initiatingReference: true },
    });
    for (const release of dropped) {
      const reference = release.initiatingReference;
      if (!reference) continue;
      // A release still being assembled *is* a publication attempt. Without
      // this the sweep queued another one every thirty seconds — thirteen
      // releases and twelve generation calls before I stopped it — because the
      // category it was recovering could not appear until the attempt already
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
        (entry) => entry.categoryKey === reference.categoryKey,
      );
      if (covered) continue;
      try {
        await this.queueAcceptedReference(
          reference,
          reference.acceptedByUserId,
        );
      } catch (error) {
        this.logger.warn(
          `Could not re-publish ${reference.categoryKey}: ${String(error)}`,
        );
      }
    }
  }

  async queueAcceptedReference(
    reference: DocumentationCategoryReference,
    userId: string,
  ): Promise<string> {
    return this.prisma.$transaction(
      async (tx) => {
        const settings = await tx.projectEditorialSettings.upsert({
          where: { projectId: reference.projectId },
          update: {},
          create: { projectId: reference.projectId },
        });
        let profileId = settings.currentProfileRevisionId;
        if (!profileId) {
          const profile = await tx.editorialProfileRevision.create({
            data: {
              projectId: reference.projectId,
              sequence: settings.nextSequence,
              length: 'balanced',
              pedagogy: 'guided',
              technicalFamiliarity: 'novice',
              tone: 'reassuring',
              confirmedByUserId: userId,
            },
          });
          await tx.projectEditorialSettings.update({
            where: { projectId: reference.projectId },
            data: {
              currentProfileRevisionId: profile.id,
              nextSequence: { increment: 1 },
              version: { increment: 1 },
            },
          });
          profileId = profile.id;
        }
        const publication = await tx.projectClientPublication.upsert({
          where: { projectId: reference.projectId },
          update: {},
          create: { projectId: reference.projectId },
        });
        const baseEntries = publication.currentReleaseId
          ? await tx.clientContentReleaseEntry.findMany({
              where: { releaseId: publication.currentReleaseId },
            })
          : [];
        const kept = baseEntries.filter(
          (entry) => entry.categoryKey !== reference.categoryKey,
        );
        const release = await tx.clientContentRelease.create({
          data: {
            projectId: reference.projectId,
            sequence: publication.nextSequence,
            baseReleaseId: publication.currentReleaseId,
            profileRevisionId: profileId,
            reason: 'category_acceptance',
            status: 'preparing',
            expectedCategoryCount: kept.length + 1,
            initiatingReferenceId: reference.id,
            entries: {
              create: kept.map((entry) => ({
                categoryKey: entry.categoryKey,
                locale: entry.locale,
                clientCategoryContentId: entry.clientCategoryContentId,
              })),
            },
          },
        });
        await tx.projectClientPublication.update({
          where: { projectId: reference.projectId },
          data: { nextSequence: { increment: 1 }, version: { increment: 1 } },
        });
        const inputFingerprint = createHash('sha256')
          .update(
            JSON.stringify({
              referenceId: reference.id,
              profileId,
              locale: 'fr',
            }),
          )
          .digest('hex');
        await this.generation.createInTransaction(tx, {
          projectId: reference.projectId,
          type: 'client_derivation',
          deduplicationKey: `client:${release.id}:${reference.categoryKey}:fr`,
          inputFingerprint,
          promptVersion: CLIENT_DERIVATION_PROMPT_VERSION,
          outputContractVersion: CLIENT_DERIVATION_OUTPUT_CONTRACT,
          sourceRevisionId: reference.sourceRevisionId,
          categoryReferenceId: reference.id,
          profileRevisionId: profileId,
          clientReleaseId: release.id,
        });
        return release.id;
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async queueEditorialProfile(
    profile: EditorialProfileRevision,
  ): Promise<string | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const publication = await tx.projectClientPublication.findUnique({
          where: { projectId: profile.projectId },
          include: {
            currentRelease: {
              include: {
                entries: { include: { clientCategoryContent: true } },
              },
            },
          },
        });
        const entries = publication?.currentRelease?.entries ?? [];
        if (!publication?.currentReleaseId || entries.length === 0) return null;
        const release = await tx.clientContentRelease.create({
          data: {
            projectId: profile.projectId,
            sequence: publication.nextSequence,
            baseReleaseId: publication.currentReleaseId,
            profileRevisionId: profile.id,
            reason: 'editorial_profile_change',
            status: 'preparing',
            expectedCategoryCount: entries.length,
          },
        });
        await tx.projectClientPublication.update({
          where: { projectId: profile.projectId },
          data: { nextSequence: { increment: 1 }, version: { increment: 1 } },
        });
        for (const entry of entries) {
          const reference = entry.clientCategoryContent;
          const inputFingerprint = createHash('sha256')
            .update(
              JSON.stringify({
                referenceId: reference.categoryReferenceId,
                profileId: profile.id,
                locale: entry.locale,
              }),
            )
            .digest('hex');
          await this.generation.createInTransaction(tx, {
            projectId: profile.projectId,
            type: 'client_derivation',
            deduplicationKey: `client:${release.id}:${entry.categoryKey}:${entry.locale}`,
            inputFingerprint,
            promptVersion: CLIENT_DERIVATION_PROMPT_VERSION,
            outputContractVersion: CLIENT_DERIVATION_OUTPUT_CONTRACT,
            categoryReferenceId: reference.categoryReferenceId,
            profileRevisionId: profile.id,
            clientReleaseId: release.id,
          });
        }
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
          include: { entries: { include: { clientCategoryContent: true } } },
        },
      },
    });
    const release = publication?.currentRelease;
    return {
      releaseId: release?.id ?? null,
      sequence: release?.sequence ?? 0,
      status: release?.status ?? null,
      visibleToClient: Boolean(release),
      readyCategoryCount: release?.entries.length ?? 0,
      expectedCategoryCount: release?.expectedCategoryCount ?? 0,
      categories:
        release?.entries.map((entry) => ({
          categoryKey: entry.categoryKey,
          blocks: entry.clientCategoryContent.structuredContent,
        })) ?? [],
      publishedAt: release?.publishedAt?.toISOString() ?? null,
    };
  }

  async readPublicCategories(projectId: string): Promise<unknown[]> {
    const view = (await this.readCurrent(projectId)) as {
      categories: Array<{ categoryKey: string; blocks: unknown }>;
    };
    return view.categories;
  }

  async readPreview(projectId: string): Promise<unknown> {
    const current = await this.readCurrent(projectId);
    const pending = await this.prisma.clientContentRelease.findFirst({
      where: {
        projectId,
        status: { in: ['queued', 'preparing', 'validating', 'ready'] },
      },
      orderBy: { sequence: 'desc' },
      include: { entries: { include: { clientCategoryContent: true } } },
    });
    return {
      current,
      pending: pending
        ? {
            releaseId: pending.id,
            sequence: pending.sequence,
            status: pending.status,
            visibleToClient: false,
            readyCategoryCount: pending.entries.length,
            expectedCategoryCount: pending.expectedCategoryCount,
            categories: pending.entries.map((entry) => ({
              categoryKey: entry.categoryKey,
              blocks: entry.clientCategoryContent.structuredContent,
            })),
            publishedAt: null,
          }
        : null,
    };
  }
}
