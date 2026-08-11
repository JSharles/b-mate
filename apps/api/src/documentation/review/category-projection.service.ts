import { Injectable } from '@nestjs/common';
import type {
  CategoryDraftTrigger,
  DocumentationCategoryKey,
} from '@prisma/client';
import { createHash } from 'node:crypto';
import { GenerationService } from '../../generation/generation.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FACTUAL_DRAFT_OUTPUT_CONTRACT,
  FACTUAL_DRAFT_PROMPT_VERSION,
} from './factual-draft-output.schema';

@Injectable()
export class CategoryProjectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: GenerationService,
  ) {}

  async ensurePendingDrafts(projectId: string): Promise<void> {
    const states = await this.prisma.categoryProjectionState.findMany({
      where: {
        projectId,
        targetSourceRevisionId: { not: null },
        activeDraftId: null,
      },
    });
    for (const state of states)
      await this.queue(
        projectId,
        state.categoryKey,
        state.targetSourceRevisionId!,
        'catch_up',
      );
  }

  async queue(
    projectId: string,
    categoryKey: DocumentationCategoryKey,
    sourceRevisionId: string,
    trigger: CategoryDraftTrigger,
    parentDraftId?: string,
  ): Promise<string | null> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "project_id" FROM "category_projection_states" WHERE "project_id"=${projectId}::uuid AND "category_key"=${categoryKey}::"DocumentationCategoryKey" FOR UPDATE`;
        const state = await tx.categoryProjectionState.findUnique({
          where: { projectId_categoryKey: { projectId, categoryKey } },
        });
        if (
          !state ||
          state.activeDraftId ||
          state.targetSourceRevisionId !== sourceRevisionId
        )
          return null;
        const revision = await tx.sourceRevision.findUnique({
          where: { id: sourceRevisionId },
          include: { items: { include: { categories: true } } },
        });
        if (!revision) return null;
        const items = revision.items
          .filter((item) =>
            item.categories.some(
              (category) => category.categoryKey === categoryKey,
            ),
          )
          .map((item) => ({
            id: item.informationItemId,
            kind: item.kind,
            state: item.state,
            content: item.content,
          }));
        const correctionInstruction = parentDraftId
          ? ((
              await tx.categoryDraftReview.findFirst({
                where: {
                  draftId: parentDraftId,
                  kind: 'correction_requested',
                },
                orderBy: { createdAt: 'desc' },
                select: { instruction: true },
              })
            )?.instruction ?? null)
          : null;
        const inputFingerprint = createHash('sha256')
          .update(
            JSON.stringify({
              categoryKey,
              sourceRevisionId,
              items,
              correctionInstruction,
            }),
          )
          .digest('hex');
        const operation = await this.generation.createInTransaction(tx, {
          projectId,
          type: 'factual_drafting',
          deduplicationKey: `factual:${projectId}:${categoryKey}:${sourceRevisionId}:${parentDraftId ?? 'root'}`,
          inputFingerprint,
          promptVersion: FACTUAL_DRAFT_PROMPT_VERSION,
          outputContractVersion: FACTUAL_DRAFT_OUTPUT_CONTRACT,
          sourceRevisionId,
        });
        const draft = await tx.documentationCategoryReferenceDraft.create({
          data: {
            projectId,
            categoryKey,
            sourceRevisionId,
            parentDraftId,
            generationOperationId: operation.id,
            trigger,
            status: parentDraftId ? 'correction_generating' : 'generating',
          },
        });
        const claimed = await tx.categoryProjectionState.updateMany({
          where: {
            projectId,
            categoryKey,
            activeDraftId: null,
            targetSourceRevisionId: sourceRevisionId,
          },
          data: { activeDraftId: draft.id, version: { increment: 1 } },
        });
        if (claimed.count !== 1) throw new Error('CATEGORY_PROJECTION_CHANGED');
        return draft.id;
      },
      { isolationLevel: 'Serializable' },
    );
  }

  async catchUp(
    projectId: string,
    categoryKey: DocumentationCategoryKey,
  ): Promise<void> {
    const state = await this.prisma.categoryProjectionState.findUnique({
      where: { projectId_categoryKey: { projectId, categoryKey } },
    });
    if (
      state?.targetSourceRevisionId &&
      !state.activeDraftId &&
      state.targetSourceRevisionId !== state.lastReviewedSourceRevisionId
    )
      await this.queue(
        projectId,
        categoryKey,
        state.targetSourceRevisionId,
        'catch_up',
      );
  }
}
