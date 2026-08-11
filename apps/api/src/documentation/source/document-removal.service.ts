import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DocumentationCategoryKey } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { DocumentStorageClient } from './document-storage.client';

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
        observations: { include: { categories: true } },
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
    const affectedCategories = [
      ...new Set(
        document.observations.flatMap((observation) =>
          observation.categories.map((category) => category.categoryKey),
        ),
      ),
    ].sort();
    return {
      documentId,
      documentVersion: document.version,
      sourceRevisionId: revisionId,
      affectedCategories,
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
    try {
      if (document?.storedObjectKey)
        await this.storage.delete(document.storedObjectKey);
    } catch {
      await this.prisma.sourceDocument.update({
        where: { id: documentId },
        data: {
          status: 'removal_failed',
          failureCode: 'DOCUMENT_STORAGE_REMOVAL_FAILED',
        },
      });
      return {
        status: 'needs_attention',
        code: 'DOCUMENT_STORAGE_REMOVAL_FAILED',
      };
    }
    try {
      if (preIncorporationRemoval) {
        await this.finalizeUnincorporatedRemoval(documentId);
        return { status: 'completed' };
      }
      const revisionId = await this.rebuild(projectId, documentId, userId);
      return { status: 'completed', revisionId };
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
    try {
      if (document.storedObjectKey)
        await this.storage.delete(document.storedObjectKey);
    } catch {
      await this.prisma.sourceDocument.update({
        where: { id: documentId },
        data: {
          status: 'removal_failed',
          failureCode: 'DOCUMENT_STORAGE_REMOVAL_FAILED',
        },
      });
      return { status: 'needs_attention' };
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
                    categories: true,
                    provenanceLinks: { include: { documentObservation: true } },
                  },
                },
              },
            },
          },
        });
        if (!source?.currentRevision)
          throw new ConflictException({ code: 'SOURCE_REVISION_UNAVAILABLE' });
        const affected = new Set<DocumentationCategoryKey>();
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
              categories: true,
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
          item.categories.forEach((category) =>
            affected.add(category.categoryKey),
          );
          previous?.categories.forEach((category) =>
            affected.add(category.categoryKey),
          );
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
              categories: {
                create: plan.replacement.categories.map((category) => ({
                  categoryKey: category.categoryKey,
                })),
              },
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
        if (affected.size > 0)
          await tx.sourceRevisionImpact.createMany({
            data: [...affected].map((categoryKey) => ({
              sourceRevisionId: revision.id,
              categoryKey,
              reason: 'Document removal changed surviving provenance.',
            })),
          });
        for (const categoryKey of affected)
          await tx.categoryProjectionState.upsert({
            where: { projectId_categoryKey: { projectId, categoryKey } },
            update: {
              targetSourceRevisionId: revision.id,
              version: { increment: 1 },
            },
            create: {
              projectId,
              categoryKey,
              targetSourceRevisionId: revision.id,
            },
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
