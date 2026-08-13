import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { DocumentStorageClient } from './document-storage.client';

// How often to look for removals abandoned mid-flight.
const STALLED_REMOVAL_SWEEP_MS = 30_000;

// How long a `removal_pending` document must sit untouched before it counts as
// abandoned rather than in progress. Comfortably longer than a finalization
// takes, so a slow rebuild is never mistaken for a crash and re-driven
// underneath itself.
const STALLED_REMOVAL_AFTER_MS = 120_000;

@Injectable()
export class DocumentRemovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly storage: DocumentStorageClient,
  ) {}
  async preview(userId: string, projectId: string, documentId: string) {
    await this.access.requireContributor(userId, projectId);
    const document = await this.prisma.sourceDocument.findFirst({
      where: {
        id: documentId,
        projectId,
        status: { notIn: ['removed', 'removal_pending'] },
      },
      include: {
        observations: true,
        project: { include: { projectSource: true } },
      },
    });
    if (!document) throw new NotFoundException({ code: 'NOT_FOUND' });
    const removableBeforeIncorporation = document.status === 'failed';
    const revisionId = removableBeforeIncorporation
      ? null
      : (document.project.projectSource?.currentRevisionId ?? null);
    if (!revisionId && !removableBeforeIncorporation)
      throw new NotFoundException({ code: 'NOT_FOUND' });
    const links = revisionId
      ? await this.prisma.provenanceLink.findMany({
          where: {
            sourceRevisionItem: { sourceRevisionId: revisionId },
            documentObservation: { sourceDocumentId: documentId },
          },
          select: { sourceRevisionItemId: true },
        })
      : [];
    const itemIds = [
      ...new Set(links.map((link) => link.sourceRevisionItemId)),
    ];
    let soleSupportItemCount = 0;
    for (const sourceRevisionItemId of itemIds) {
      const otherSupports = await this.prisma.provenanceLink.count({
        where: {
          sourceRevisionItemId,
          role: { in: ['supports', 'confirms'] },
          OR: [
            { contributorAssertionId: { not: null } },
            { documentObservation: { sourceDocumentId: { not: documentId } } },
          ],
        },
      });
      if (otherSupports === 0) soleSupportItemCount += 1;
    }
    return {
      documentId,
      documentVersion: document.version,
      sourceRevisionId: revisionId,
      observationCount: document.observations.length,
      supportedItemCount: itemIds.length,
      soleSupportItemCount,
      confirmationToken: this.token(documentId, document.version, revisionId),
    };
  }
  async confirm(
    userId: string,
    projectId: string,
    documentId: string,
    input: {
      expectedDocumentVersion: number;
      expectedSourceRevisionId: string | null;
      confirmationToken: string;
    },
  ) {
    await this.access.requireContributor(userId, projectId);
    if (
      input.confirmationToken !==
      this.token(
        documentId,
        input.expectedDocumentVersion,
        input.expectedSourceRevisionId,
      )
    )
      throw new ConflictException({ code: 'STALE_REMOVAL_PREVIEW' });
    const preIncorporationRemoval = input.expectedSourceRevisionId === null;
    const claimed = await this.prisma.sourceDocument.updateMany({
      where: {
        id: documentId,
        projectId,
        version: input.expectedDocumentVersion,
        status: preIncorporationRemoval
          ? 'failed'
          : { notIn: ['removed', 'removal_pending'] },
      },
      data: { status: 'removal_pending', version: { increment: 1 } },
    });
    if (claimed.count !== 1)
      throw new ConflictException({ code: 'STALE_REMOVAL_PREVIEW' });
    const document = await this.prisma.sourceDocument.findUnique({
      where: { id: documentId },
    });
    return this.finalizeRemoval(
      projectId,
      documentId,
      userId,
      !preIncorporationRemoval,
      document?.storedObjectKey ?? null,
    );
  }
  async retry(userId: string, projectId: string, documentId: string) {
    await this.access.requireContributor(userId, projectId);
    const document = await this.prisma.sourceDocument.findFirst({
      where: {
        id: documentId,
        projectId,
        status: { in: ['removal_failed', 'removal_pending'] },
      },
      include: { project: { include: { projectSource: true } } },
    });
    if (!document) throw new NotFoundException({ code: 'NOT_FOUND' });
    const requiresRebuild = document.incorporatedInRevisionId !== null;
    if (requiresRebuild && !document.project.projectSource?.currentRevisionId)
      throw new NotFoundException({ code: 'NOT_FOUND' });
    await this.prisma.sourceDocument.update({
      where: { id: documentId },
      data: { status: 'removal_pending', failureCode: null },
    });
    return this.finalizeRemoval(
      projectId,
      documentId,
      userId,
      requiresRebuild,
      document.storedObjectKey,
    );
  }
  // `removal_pending` is an in-flight state held in memory by whichever request
  // is finalizing the removal. If that process dies in between — a crash, a
  // deploy, an API that will not boot — nothing is left to drive it, and the
  // document sits pending forever behind a spinner that will never resolve.
  // That is exactly how four documents got stranded in dev.
  //
  // Recovery is safe to automate because finalization is all local work
  // (delete the stored object, rebuild the source): there is no provider call
  // to double-submit, and every step below is idempotent. A stall is therefore
  // a crash to recover from, not a decision to escalate — genuine failures
  // still land in `removal_failed`, where the existing contributor-facing
  // retry takes over.
  @Interval(STALLED_REMOVAL_SWEEP_MS)
  async recoverStalledRemovals(): Promise<void> {
    const stalledBefore = new Date(Date.now() - STALLED_REMOVAL_AFTER_MS);
    const stalled = await this.prisma.sourceDocument.findMany({
      where: { status: 'removal_pending', updatedAt: { lt: stalledBefore } },
      include: { project: { include: { projectSource: true } } },
    });

    for (const document of stalled) {
      try {
        await this.finalizeRemoval(
          document.projectId,
          document.id,
          // Provenance for the rebuild. The contributor who asked for the
          // removal is not recorded on the document, so the one who added it
          // stands in — this is a system-driven recovery of their request,
          // not a new decision by anyone else.
          document.addedByUserId,
          document.incorporatedInRevisionId !== null,
          document.storedObjectKey,
        );
      } catch {
        // One stranded document must not stop the sweep clearing the others;
        // finalizeRemoval has already recorded why this one stayed behind.
      }
    }
  }

  // The finalization half of a removal, shared by the request path, the
  // contributor's retry, and the stall sweep — so all three leave the document
  // in the same states for the same reasons.
  private async finalizeRemoval(
    projectId: string,
    documentId: string,
    userId: string,
    requiresRebuild: boolean,
    storedObjectKey: string | null,
  ): Promise<{ status: string; code?: string; revisionId?: string }> {
    try {
      if (storedObjectKey) await this.storage.delete(storedObjectKey);
    } catch {
      await this.markRemovalFailed(
        documentId,
        'DOCUMENT_STORAGE_REMOVAL_FAILED',
      );
      return {
        status: 'needs_attention',
        code: 'DOCUMENT_STORAGE_REMOVAL_FAILED',
      };
    }

    try {
      if (!requiresRebuild) {
        await this.finalizeUnincorporatedRemoval(documentId);
        return { status: 'completed' };
      }
      return {
        status: 'completed',
        revisionId: await this.rebuild(projectId, documentId, userId),
      };
    } catch {
      await this.markRemovalFailed(
        documentId,
        'DOCUMENT_REMOVAL_FINALIZATION_FAILED',
      );
      return {
        status: 'needs_attention',
        code: 'DOCUMENT_REMOVAL_FINALIZATION_FAILED',
      };
    }
  }

  private async finalizeUnincorporatedRemoval(
    documentId: string,
  ): Promise<void> {
    await this.prisma.sourceDocument.update({
      where: { id: documentId },
      data: {
        status: 'removed',
        removedAt: new Date(),
        storedObjectKey: null,
        failureCode: null,
        version: { increment: 1 },
      },
    });
  }
  private async markRemovalFailed(
    documentId: string,
    failureCode: string,
  ): Promise<void> {
    await this.prisma.sourceDocument.update({
      where: { id: documentId },
      data: { status: 'removal_failed', failureCode },
    });
  }
  private async rebuild(
    projectId: string,
    documentId: string,
    userId: string,
  ): Promise<string> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "project_sources" WHERE "project_id"=${projectId}::uuid FOR UPDATE`;
        const source = await tx.projectSource.findUnique({
          where: { projectId },
          include: {
            currentRevision: {
              include: {
                items: {
                  include: {
                    provenanceLinks: { include: { documentObservation: true } },
                  },
                },
              },
            },
          },
        });
        if (!source?.currentRevision)
          throw new ConflictException({ code: 'SOURCE_REVISION_UNAVAILABLE' });
        const planned: Array<{
          current: (typeof source.currentRevision.items)[number];
          replacement: (typeof source.currentRevision.items)[number] | null;
          links: (typeof source.currentRevision.items)[number]['provenanceLinks'];
        }> = [];
        for (const item of source.currentRevision.items) {
          const surviving = item.provenanceLinks.filter(
            (link) => link.documentObservation?.sourceDocumentId !== documentId,
          );
          if (
            surviving.some(
              (link) => link.role === 'supports' || link.role === 'confirms',
            )
          ) {
            planned.push({
              current: item,
              replacement: item,
              links: surviving,
            });
            continue;
          }
          const previous = await tx.sourceRevisionItem.findFirst({
            where: {
              informationItemId: item.informationItemId,
              sourceRevision: {
                projectSourceId: source.id,
                sequence: { lt: source.currentRevision.sequence },
              },
              provenanceLinks: {
                some: {
                  OR: [
                    { contributorAssertionId: { not: null } },
                    {
                      documentObservation: {
                        sourceDocumentId: { not: documentId },
                      },
                    },
                  ],
                },
              },
            },
            orderBy: { sourceRevision: { sequence: 'desc' } },
            include: {
              provenanceLinks: { include: { documentObservation: true } },
            },
          });
          const previousLinks =
            previous?.provenanceLinks.filter(
              (link) =>
                link.documentObservation?.sourceDocumentId !== documentId,
            ) ?? [];
          planned.push({
            current: item,
            replacement: previous,
            links: previousLinks,
          });
        }
        const revision = await tx.sourceRevision.create({
          data: {
            projectSourceId: source.id,
            sequence: source.nextSequence,
            parentRevisionId: source.currentRevisionId,
            trigger: 'document_removed',
            triggerDocumentId: documentId,
            createdByUserId: userId,
            summary:
              'Document removed; canonical source rebuilt from surviving provenance.',
          },
        });
        for (const plan of planned) {
          if (!plan.replacement) {
            await tx.sourceRevisionChange.create({
              data: {
                sourceRevisionId: revision.id,
                informationItemId: plan.current.informationItemId,
                kind: 'removed',
                beforeRevisionItemId: plan.current.id,
                causeDocumentId: documentId,
                explanation:
                  'The removed document was the only surviving support.',
              },
            });
            continue;
          }
          const created = await tx.sourceRevisionItem.create({
            data: {
              sourceRevisionId: revision.id,
              informationItemId: plan.current.informationItemId,
              previousRevisionItemId: plan.current.id,
              kind: plan.replacement.kind,
              state: plan.replacement.state,
              content: plan.replacement.content,
              sortOrder: plan.current.sortOrder,
              provenanceLinks: {
                create: plan.links.map((link) => ({
                  documentObservationId: link.documentObservationId,
                  contributorAssertionId: link.contributorAssertionId,
                  role: link.role,
                })),
              },
            },
          });
          if (plan.replacement.id !== plan.current.id)
            await tx.sourceRevisionChange.create({
              data: {
                sourceRevisionId: revision.id,
                informationItemId: plan.current.informationItemId,
                kind: 'superseded',
                beforeRevisionItemId: plan.current.id,
                afterRevisionItemId: created.id,
                causeDocumentId: documentId,
                explanation:
                  'A previously supported value became current again after removal.',
              },
            });
        }
        // FR-018: the source moved, so every live section may now be out of
        // date. They are marked, never recomposed — the contributor decides
        // which ones are worth refreshing, and the client keeps reading what
        // was approved until they do.
        await tx.clientSection.updateMany({
          where: { projectId, archivedAt: null, refreshNeeded: false },
          data: { refreshNeeded: true, version: { increment: 1 } },
        });
        await tx.projectSource.updateMany({
          where: { projectId, referenceNeedsRewrite: false },
          data: { referenceNeedsRewrite: true },
        });
        await tx.projectSource.update({
          where: { id: source.id },
          data: {
            currentRevisionId: revision.id,
            nextSequence: { increment: 1 },
            lockVersion: { increment: 1 },
          },
        });
        await tx.sourceDocument.update({
          where: { id: documentId },
          data: {
            status: 'removed',
            removedInRevisionId: revision.id,
            removedAt: new Date(),
            storedObjectKey: null,
            failureCode: null,
            version: { increment: 1 },
          },
        });
        return revision.id;
      },
      { isolationLevel: 'Serializable' },
    );
  }
  private token(
    documentId: string,
    version: number,
    revisionId: string | null,
  ): string {
    return createHash('sha256')
      .update(`${documentId}:${version}:${revisionId ?? 'not-incorporated'}`)
      .digest('hex');
  }
}
