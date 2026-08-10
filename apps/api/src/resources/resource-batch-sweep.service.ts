import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Resource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceAnalysisClient } from './reference-analysis.client';
import type { ReferenceQuestionOutput } from './reference-output.schema';

// Only the slice of the transaction client this service writes questions
// through — narrow enough that the Prisma mock satisfies it directly.
type QuestionWriter = {
  referenceQuestion: {
    deleteMany: (args: { where: { draftId: string } }) => Promise<unknown>;
    createMany: (args: {
      data: { draftId: string; question: string; rank: number }[];
    }) => Promise<unknown>;
  };
};

// FR-021/FR-023: questions never block. `awaiting_answers` marks a draft that
// has some outstanding — it is still fully reviewable, and accepting it as-is
// leaves the open points marked in the text rather than silently resolved.
function statusForQuestions(
  questions: ReferenceQuestionOutput[] | undefined,
): 'pending_review' | 'awaiting_answers' {
  return questions && questions.length > 0
    ? 'awaiting_answers'
    : 'pending_review';
}

// Fully decoupled from any frontend request: this is the only thing that ever
// polls the Batch API. The pipeline's state lives in Postgres and this sweep
// moves it forward — durable across restarts, inspectable in psql, and the
// right shape for work that can take hours (plan.md § Constitution Check).
@Injectable()
export class ResourceBatchSweepService {
  private readonly logger = new Logger(ResourceBatchSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly referenceAnalysisClient: ReferenceAnalysisClient,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    const pending = await this.prisma.resource.findMany({
      where: { status: 'pending', anthropicBatchId: { not: null } },
    });

    for (const resource of pending) {
      await this.processResource(resource);
    }

    // Regeneration rides the same durable path as ingestion rather than a
    // fire-and-forget promise, which would not survive a restart.
    const generating = await this.prisma.categoryReferenceDraft.findMany({
      where: { status: 'generating', anthropicBatchId: { not: null } },
    });

    for (const draft of generating) {
      await this.processDraft(draft);
    }

    const deriving = await this.prisma.categoryReference.findMany({
      where: { derivationBatchId: { not: null } },
    });

    for (const reference of deriving) {
      await this.processDerivation(reference);
    }
  }

  private async processDerivation(reference: {
    id: string;
    projectId: string;
    categoryKey: string;
    derivationBatchId: string | null;
  }): Promise<void> {
    try {
      const result = await this.referenceAnalysisClient.pollDerivation(
        reference.derivationBatchId as string,
      );

      if (result.status === 'pending') {
        return;
      }

      if (result.status === 'failed') {
        // The previously derived content stays live: a failed derivation must
        // not blank a category the client is already reading.
        this.logger.warn(
          `Derivation failed for category ${reference.categoryKey} of project ${reference.projectId}: ${result.reason}`,
        );
        await this.prisma.categoryReference.update({
          where: { id: reference.id },
          data: { derivationBatchId: null },
        });
        return;
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.categoryContent.upsert({
          where: {
            projectId_categoryKey: {
              projectId: reference.projectId,
              categoryKey: reference.categoryKey as never,
            },
          },
          create: {
            projectId: reference.projectId,
            categoryKey: reference.categoryKey as never,
            contentEn: result.contentEn,
            contentFr: result.contentFr,
          },
          update: {
            contentEn: result.contentEn,
            contentFr: result.contentFr,
          },
        });
        await tx.categoryReference.update({
          where: { id: reference.id },
          data: { derivationBatchId: null },
        });
      });
    } catch (error) {
      this.logger.warn(
        `Failed to poll derivation for reference ${reference.id}: ${String(error)}`,
      );
    }
  }

  private async processDraft(draft: {
    id: string;
    anthropicBatchId: string | null;
  }): Promise<void> {
    try {
      const result = await this.referenceAnalysisClient.pollRebuild(
        draft.anthropicBatchId as string,
      );

      if (result.status === 'pending') {
        return;
      }

      if (result.status === 'succeeded') {
        await this.prisma.$transaction(async (tx) => {
          await tx.categoryReferenceDraft.update({
            where: { id: draft.id },
            data: {
              content: result.reference,
              status: statusForQuestions(result.questions),
              anthropicBatchId: null,
            },
          });
          await this.replaceQuestions(tx, draft.id, result.questions);
        });
        return;
      }

      // A failed rebuild must not leave the draft stuck in `generating`, where
      // nothing can be done with it. It goes back to the contributor carrying
      // the reason, so accept-or-discard remain available. Any question from a
      // previous version goes with it — it referred to text that no longer
      // exists.
      await this.prisma.$transaction(async (tx) => {
        await tx.categoryReferenceDraft.update({
          where: { id: draft.id },
          data: {
            content: `The last regeneration could not be completed: ${result.reason}`,
            status: 'pending_review',
            anthropicBatchId: null,
          },
        });
        await tx.referenceQuestion.deleteMany({ where: { draftId: draft.id } });
      });
    } catch (error) {
      this.logger.warn(
        `Failed to poll rebuild for draft ${draft.id}: ${String(error)}`,
      );
    }
  }

  private async processResource(resource: Resource): Promise<void> {
    try {
      const result = await this.referenceAnalysisClient.pollIngestion(
        resource.anthropicBatchId as string,
      );

      if (result.status === 'pending') {
        return;
      }

      if (result.status === 'succeeded') {
        await this.absorb(resource, result.categories);
        return;
      }

      await this.prisma.resource.update({
        where: { id: resource.id },
        data: {
          status: 'failed',
          failureReason: result.reason,
          anthropicBatchId: null,
        },
      });
    } catch (error) {
      // One broken document must not abort the sweep for every other one —
      // log and move on; the next sweep retries.
      this.logger.warn(
        `Failed to poll batch for resource ${resource.id}: ${String(error)}`,
      );
    }
  }

  // A draft's questions always describe the version of the text it arrived
  // with, so a new version replaces them wholesale rather than accumulating
  // answers against points that may no longer exist.
  private async replaceQuestions(
    tx: QuestionWriter,
    draftId: string,
    questions: ReferenceQuestionOutput[],
  ): Promise<void> {
    await tx.referenceQuestion.deleteMany({ where: { draftId } });
    if (questions.length === 0) {
      return;
    }
    await tx.referenceQuestion.createMany({
      data: questions.map((entry) => ({
        draftId,
        question: entry.question,
        rank: entry.rank,
      })),
    });
  }

  private async absorb(
    resource: Resource,
    categories: {
      categoryKey: string;
      extract: string;
      reference: string;
      questions?: ReferenceQuestionOutput[];
    }[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Existing drafts for the categories this document touches. Their
      // presence is what decides whether the merged body can be used.
      const blocked = await tx.categoryReferenceDraft.findMany({
        where: {
          projectId: resource.projectId,
          categoryKey: {
            in: categories.map((c) => c.categoryKey) as never[],
          },
        },
        select: { categoryKey: true },
      });
      const blockedKeys = new Set(blocked.map((draft) => draft.categoryKey));

      for (const category of categories) {
        // The extract is always stored, even when the draft is blocked: it is
        // this document's contribution, and the category will be rebuilt from
        // the surviving extracts later. Upserted rather than created so a
        // re-poll of the same ended batch updates instead of duplicating.
        await tx.categoryExtract.upsert({
          where: {
            resourceId_categoryKey: {
              resourceId: resource.id,
              categoryKey: category.categoryKey as never,
            },
          },
          create: {
            resourceId: resource.id,
            categoryKey: category.categoryKey as never,
            content: category.extract,
          },
          update: { content: category.extract },
        });

        // Serialisation (spec Edge Cases): this document's merged body was
        // computed against the *live* reference, so it knows nothing of a
        // draft already waiting for review. Overwriting that draft would
        // silently discard the other document's material. The extract above is
        // kept instead, and accepting the pending draft rebuilds the category
        // from every extract — including this one.
        if (blockedKeys.has(category.categoryKey as never)) {
          continue;
        }

        const status = statusForQuestions(category.questions);
        const saved = await tx.categoryReferenceDraft.upsert({
          where: {
            projectId_categoryKey: {
              projectId: resource.projectId,
              categoryKey: category.categoryKey as never,
            },
          },
          create: {
            projectId: resource.projectId,
            categoryKey: category.categoryKey as never,
            content: category.reference,
            status,
            trigger: 'document_added',
            triggerResourceId: resource.id,
          },
          update: {
            content: category.reference,
            status,
            trigger: 'document_added',
            triggerResourceId: resource.id,
          },
        });

        await this.replaceQuestions(tx, saved.id, category.questions ?? []);
      }

      await tx.resource.update({
        where: { id: resource.id },
        data: { status: 'absorbed', anthropicBatchId: null },
      });
    });
  }
}
