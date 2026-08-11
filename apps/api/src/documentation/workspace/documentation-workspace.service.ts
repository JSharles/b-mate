import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../projects/project-access.service';

@Injectable()
export class DocumentationWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
  ) {}

  async get(userId: string, projectId: string) {
    await this.access.requireContributor(userId, projectId);
    const [
      source,
      documentCount,
      activeOperationCount,
      failedOperationCount,
      openClarificationCount,
      pendingReviewCount,
      publication,
      pendingRelease,
    ] = await Promise.all([
      this.prisma.projectSource.findUnique({ where: { projectId } }),
      this.prisma.sourceDocument.count({
        where: { projectId, status: { not: 'removed' } },
      }),
      this.prisma.generationOperation.count({
        where: {
          projectId,
          status: {
            in: ['queued', 'running', 'waiting_provider', 'retry_scheduled'],
          },
        },
      }),
      // An operation attached to a document that has since been removed is not
      // something a contributor can act on, and counting it meant the alarm
      // could never be cleared: it kept every failure the project ever had.
      this.prisma.generationOperation.count({
        where: {
          projectId,
          status: 'needs_attention',
          OR: [
            { sourceDocumentId: null },
            { sourceDocument: { status: { not: 'removed' } } },
          ],
        },
      }),
      this.prisma.clarification.count({
        where: {
          projectSource: { projectId },
          status: { in: ['open', 'left_open'] },
        },
      }),
      this.prisma.documentationCategoryReferenceDraft.count({
        where: { projectId, status: 'pending_review' },
      }),
      this.prisma.projectClientPublication.findUnique({
        where: { projectId },
      }),
      this.prisma.clientContentRelease.findFirst({
        where: {
          projectId,
          status: { in: ['queued', 'preparing', 'validating', 'ready'] },
        },
        orderBy: { sequence: 'desc' },
        include: { entries: true },
      }),
    ]);
    const priority =
      failedOperationCount > 0
        ? 'needs_attention'
        : pendingReviewCount > 0
          ? 'needs_action'
          : activeOperationCount > 0
            ? 'processing'
            : publication?.currentReleaseId
              ? 'published'
              : 'empty';
    const clientVisibility = publication?.currentReleaseId
      ? pendingRelease
        ? 'previous_version_visible'
        : 'current_version_visible'
      : 'nothing_published';
    return {
      priority,
      activeOperationCount,
      openClarificationCount,
      pendingReviewCount,
      failedOperationCount,
      documentCount,
      currentSourceRevisionId: source?.currentRevisionId ?? null,
      currentReleaseId: publication?.currentReleaseId ?? null,
      pendingReleaseId: pendingRelease?.id ?? null,
      releaseProgress: pendingRelease
        ? {
            ready: pendingRelease.entries.length,
            expected: pendingRelease.expectedCategoryCount,
          }
        : null,
      clientVisibility,
      changeToken: [
        source?.currentRevisionId ?? 'none',
        publication?.currentReleaseId ?? 'none',
        pendingRelease?.id ?? 'none',
        pendingReviewCount,
        activeOperationCount,
        failedOperationCount,
      ].join(':'),
      refreshAfterMs:
        activeOperationCount > 0 || pendingRelease ? 5_000 : 30_000,
    };
  }
}
