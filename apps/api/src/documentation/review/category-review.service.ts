import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { DocumentationCategoryKey } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { ClientPublicationService } from '../publication/client-publication.service';
import { CategoryProjectionService } from './category-projection.service';
import { EditorialIntentService } from './editorial-intent.service';

@Injectable()
export class CategoryReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly projections: CategoryProjectionService,
    private readonly publication: ClientPublicationService,
    private readonly editorialIntent: EditorialIntentService,
  ) {}
  async list(userId: string, projectId: string) {
    await this.access.requireContributor(userId, projectId);
    await this.projections.ensurePendingDrafts(projectId);
    return this.prisma.categoryProjectionState.findMany({
      where: { projectId },
      include: { activeDraft: true },
      orderBy: { categoryKey: 'asc' },
    });
  }
  async detail(userId: string, projectId: string, draftId: string) {
    await this.access.requireContributor(userId, projectId);
    const draft =
      await this.prisma.documentationCategoryReferenceDraft.findFirst({
        where: { id: draftId, projectId },
      });
    if (!draft) throw new NotFoundException({ code: 'NOT_FOUND' });
    return {
      ...draft,
      blocks: draft.structuredContent ?? [],
      provenanceSummary: draft.provenanceSummary ?? [],
    };
  }
  async accept(
    userId: string,
    projectId: string,
    draftId: string,
    expectedVersion: number,
  ) {
    await this.access.requireContributor(userId, projectId);
    const reference = await this.prisma.$transaction(
      async (tx) => {
        const draft = await tx.documentationCategoryReferenceDraft.findFirst({
          where: {
            id: draftId,
            projectId,
            status: 'pending_review',
            version: expectedVersion,
          },
        });
        if (!draft || !draft.structuredContent)
          throw new ConflictException({ code: 'STALE_REVIEW' });
        const reference = await tx.documentationCategoryReference.create({
          data: {
            projectId,
            categoryKey: draft.categoryKey,
            sourceRevisionId: draft.sourceRevisionId,
            acceptedDraftId: draft.id,
            structuredContent: draft.structuredContent,
            acceptedByUserId: userId,
          },
        });
        await tx.categoryDraftReview.create({
          data: { draftId, kind: 'accept', reviewedByUserId: userId },
        });
        await tx.documentationCategoryReferenceDraft.update({
          where: { id: draftId },
          data: {
            status: 'accepted',
            reviewedAt: new Date(),
            reviewedByUserId: userId,
            version: { increment: 1 },
          },
        });
        await tx.categoryProjectionState.update({
          where: {
            projectId_categoryKey: {
              projectId,
              categoryKey: draft.categoryKey,
            },
          },
          data: {
            activeDraftId: null,
            validatedReferenceId: reference.id,
            lastReviewedSourceRevisionId: draft.sourceRevisionId,
            version: { increment: 1 },
          },
        });
        return reference;
      },
      { isolationLevel: 'Serializable' },
    );
    const releaseId = await this.publication.queueAcceptedReference(
      reference,
      userId,
    );
    await this.projections.catchUp(projectId, reference.categoryKey);
    return { referenceId: reference.id, releaseId };
  }
  async discard(
    userId: string,
    projectId: string,
    draftId: string,
    expectedVersion: number,
  ) {
    await this.access.requireContributor(userId, projectId);
    const category = await this.close(
      userId,
      projectId,
      draftId,
      expectedVersion,
      'discard',
    );
    await this.projections.catchUp(projectId, category);
    return { discarded: true };
  }
  async correct(
    userId: string,
    projectId: string,
    draftId: string,
    expectedVersion: number,
    instruction: string,
  ) {
    await this.access.requireContributor(userId, projectId);
    if (this.editorialIntent.isEditorial(instruction))
      return {
        routingCode: 'EDITORIAL_INSTRUCTION_REQUIRED',
        operationId: null,
      };
    const draft =
      await this.prisma.documentationCategoryReferenceDraft.findFirst({
        where: {
          id: draftId,
          projectId,
          status: 'pending_review',
          version: expectedVersion,
        },
      });
    if (!draft) throw new ConflictException({ code: 'STALE_REVIEW' });
    await this.prisma.$transaction(async (tx) => {
      await tx.categoryDraftReview.create({
        data: {
          draftId,
          kind: 'correction_requested',
          instruction,
          reviewedByUserId: userId,
        },
      });
      await tx.documentationCategoryReferenceDraft.update({
        where: { id: draftId },
        data: {
          status: 'discarded',
          reviewedAt: new Date(),
          reviewedByUserId: userId,
          version: { increment: 1 },
        },
      });
      await tx.categoryProjectionState.update({
        where: {
          projectId_categoryKey: { projectId, categoryKey: draft.categoryKey },
        },
        data: { activeDraftId: null, version: { increment: 1 } },
      });
    });
    const newDraftId = await this.projections.queue(
      projectId,
      draft.categoryKey,
      draft.sourceRevisionId,
      'factual_correction',
      draft.id,
    );
    return {
      routingCode: 'FACTUAL_CORRECTION_QUEUED',
      operationId: newDraftId,
    };
  }
  private async close(
    userId: string,
    projectId: string,
    draftId: string,
    expectedVersion: number,
    kind: 'discard',
  ): Promise<DocumentationCategoryKey> {
    return this.prisma.$transaction(
      async (tx) => {
        const draft = await tx.documentationCategoryReferenceDraft.findFirst({
          where: {
            id: draftId,
            projectId,
            status: 'pending_review',
            version: expectedVersion,
          },
        });
        if (!draft) throw new ConflictException({ code: 'STALE_REVIEW' });
        await tx.categoryDraftReview.create({
          data: { draftId, kind, reviewedByUserId: userId },
        });
        await tx.documentationCategoryReferenceDraft.update({
          where: { id: draftId },
          data: {
            status: 'discarded',
            reviewedAt: new Date(),
            reviewedByUserId: userId,
            version: { increment: 1 },
          },
        });
        await tx.categoryProjectionState.update({
          where: {
            projectId_categoryKey: {
              projectId,
              categoryKey: draft.categoryKey,
            },
          },
          data: {
            activeDraftId: null,
            lastReviewedSourceRevisionId: draft.sourceRevisionId,
            version: { increment: 1 },
          },
        });
        return draft.categoryKey;
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
