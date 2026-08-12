import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
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

// How often to look for a category left with nothing in flight and a revision
// still to draft.
const STRANDED_CATEGORY_SWEEP_MS = 30_000;

@Injectable()
export class CategoryProjectionService {
  private readonly logger = new Logger(CategoryProjectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly generation: GenerationService,
  ) {}

  // Catching up only ever happened when a contributor accepted or discarded a
  // draft. A category whose generation died was therefore stranded: its slot
  // freed, its revision undrafted, and nobody left to ask. A revision that
  // already produced a failed draft is skipped — that is a real failure the
  // contributor has been told about, not something to re-run every half minute.
  @Interval(STRANDED_CATEGORY_SWEEP_MS)
  async recoverStrandedCategories(): Promise<void> {
    const stranded = await this.prisma.categoryProjectionState.findMany({
      where: { targetSourceRevisionId: { not: null }, activeDraftId: null },
    });
    for (const state of stranded) {
      const target = state.targetSourceRevisionId;
      if (!target || target === state.lastReviewedSourceRevisionId) continue;
      const alreadyFailed =
        await this.prisma.documentationCategoryReferenceDraft.count({
          where: {
            projectId: state.projectId,
            categoryKey: state.categoryKey,
            sourceRevisionId: target,
            status: 'failed',
          },
        });
      if (alreadyFailed > 0) continue;
      try {
        await this.catchUp(state.projectId, state.categoryKey);
      } catch (error) {
        this.logger.warn(
          `Could not catch up ${state.categoryKey}: ${String(error)}`,
        );
      }
    }
  }

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
        // Re-running abandoned work is new work. Keyed only on the category and
        // the revision, a catch-up resolved to the operation that had already
        // died, which already owned a draft — and the unique constraint on that
        // pairing meant a stranded category could never be picked up again.
        const previousDrafts =
          await tx.documentationCategoryReferenceDraft.findMany({
            where: { projectId, categoryKey, sourceRevisionId, parentDraftId },
            select: { generationOperationId: true },
          });
        const previousAttempts = previousDrafts.length;
        // The attempt being replaced is over. Left in `needs_attention` it kept
        // the project's alarm lit under a draft that had since been rebuilt —
        // "the processing did not complete", about work that just had.
        await tx.generationOperation.updateMany({
          where: {
            id: { in: previousDrafts.map((d) => d.generationOperationId) },
            status: 'needs_attention',
          },
          data: { status: 'superseded', supersededAt: new Date() },
        });
        const operation = await this.generation.createInTransaction(tx, {
          projectId,
          type: 'factual_drafting',
          deduplicationKey: `factual:${projectId}:${categoryKey}:${sourceRevisionId}:${parentDraftId ?? 'root'}:${previousAttempts}`,
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
