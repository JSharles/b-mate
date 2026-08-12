import { Injectable, OnModuleInit } from '@nestjs/common';
import type { GenerationOperation, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { GenerationProviderResult } from '../../generation/adapters/generation-provider';
import type {
  GenerationHandler,
  GenerationRequestInput,
} from '../../generation/generation-handler.registry';
import { GenerationHandlerRegistry } from '../../generation/generation-handler.registry';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FACTUAL_DRAFT_JSON_SCHEMA,
  FACTUAL_DRAFT_OUTPUT_CONTRACT,
  FactualDraftOutputSchema,
  validateFactualCoverage,
} from './factual-draft-output.schema';
import { buildFactualDraftPrompt } from './prompts/factual-draft.prompt';

@Injectable()
export class FactualDraftHandler implements GenerationHandler, OnModuleInit {
  readonly type = 'factual_drafting' as const;
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: GenerationHandlerRegistry,
  ) {}
  onModuleInit(): void {
    this.registry.register(this);
  }

  async buildRequest(
    operation: GenerationOperation,
  ): Promise<GenerationRequestInput> {
    const draft =
      await this.prisma.documentationCategoryReferenceDraft.findUnique({
        where: { generationOperationId: operation.id },
        include: {
          parentDraft: {
            include: {
              reviews: {
                where: { kind: 'correction_requested' },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
          sourceRevision: {
            include: {
              projectSource: true,
              items: { include: { categories: true } },
            },
          },
        },
      });
    if (
      !draft ||
      (draft.status !== 'generating' &&
        draft.status !== 'correction_generating')
    )
      throw new Error('FACTUAL_DRAFT_NOT_CURRENT');
    const items = draft.sourceRevision.items
      .filter((item) =>
        item.categories.some(
          (category) => category.categoryKey === draft.categoryKey,
        ),
      )
      .map((item) => ({
        id: item.informationItemId,
        kind: item.kind,
        state: item.state,
        content: item.content,
      }));
    const correctionInstruction =
      draft.parentDraft?.reviews[0]?.instruction ?? null;
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          categoryKey: draft.categoryKey,
          sourceRevisionId: draft.sourceRevisionId,
          items,
          correctionInstruction,
        }),
      )
      .digest('hex');
    if (fingerprint !== operation.inputFingerprint)
      throw new Error('FACTUAL_DRAFT_INPUT_DRIFT');
    return {
      parts: [
        {
          kind: 'text',
          text: buildFactualDraftPrompt({
            categoryKey: draft.categoryKey,
            sourceRevisionId: draft.sourceRevisionId,
            items,
            correctionInstruction,
          }),
        },
      ],
      outputContract: FACTUAL_DRAFT_OUTPUT_CONTRACT,
      outputSchema: FACTUAL_DRAFT_JSON_SCHEMA,
      maxOutputTokens: 8_000,
    };
  }

  async apply(
    tx: Prisma.TransactionClient,
    operation: GenerationOperation,
    result: GenerationProviderResult,
  ): Promise<void> {
    const output = FactualDraftOutputSchema.parse(result.output);
    // No echoed fingerprint to compare: a result comes back on the attempt it
    // was submitted for, and applySuccessfulResult refuses an attempt that is
    // no longer the operation's current one. Asking the model to copy 64 random
    // characters plus a UUID verified nothing and killed this stage twice when
    // it got one of them wrong.
    const draft = await tx.documentationCategoryReferenceDraft.findUnique({
      where: { generationOperationId: operation.id },
      include: {
        sourceRevision: {
          include: { items: { include: { categories: true } } },
        },
      },
    });
    if (!draft || draft.categoryKey !== output.categoryKey)
      throw new Error('FACTUAL_DRAFT_NOT_CURRENT');
    const ids = draft.sourceRevision.items
      .filter((item) =>
        item.categories.some(
          (category) => category.categoryKey === draft.categoryKey,
        ),
      )
      .map((item) => item.informationItemId);
    validateFactualCoverage(output, ids);
    await tx.documentationCategoryReferenceDraft.update({
      where: { id: draft.id },
      data: {
        status: 'pending_review',
        structuredContent: output.blocks,
        changeSummary: output.changeSummary,
        provenanceSummary: output.provenanceSummary,
        version: { increment: 1 },
        failureCode: null,
      },
    });
  }

  // A category holds one draft slot at a time, and only a draft that reaches an
  // end releases it. Nothing released the slot when the generation behind the
  // draft died, so the category was blocked for good: three of them sat on
  // "generating" for a day, pinned to a revision that no longer existed, and
  // every later revision found the slot taken and produced nothing to review.
  async onTerminalFailure(
    tx: Prisma.TransactionClient,
    operation: GenerationOperation,
    failureCode: string,
  ): Promise<void> {
    const draft = await tx.documentationCategoryReferenceDraft.findFirst({
      where: {
        generationOperationId: operation.id,
        status: { in: ['generating', 'correction_generating'] },
      },
      select: { id: true, projectId: true, categoryKey: true },
    });
    if (!draft) return;
    await tx.documentationCategoryReferenceDraft.update({
      where: { id: draft.id },
      data: { status: 'failed', failureCode, version: { increment: 1 } },
    });
    await tx.categoryProjectionState.updateMany({
      where: {
        projectId: draft.projectId,
        categoryKey: draft.categoryKey,
        activeDraftId: draft.id,
      },
      data: { activeDraftId: null, version: { increment: 1 } },
    });
  }
}
