import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Resource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentVulgarizationClient } from './document-vulgarization.client';

// Mirrors TaskVulgarizationService's sweep pattern (specs/007) — fully
// decoupled from any frontend request; this is the only thing that ever
// polls the Claude Batch API for resource processing (research.md
// Decision 4).
@Injectable()
export class ResourceBatchSweepService {
  private readonly logger = new Logger(ResourceBatchSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentVulgarizationClient: DocumentVulgarizationClient,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    const pending = await this.prisma.resource.findMany({
      where: { status: 'processing', anthropicBatchId: { not: null } },
    });

    for (const resource of pending) {
      await this.processResource(resource);
    }
  }

  private async processResource(resource: Resource): Promise<void> {
    try {
      const result = await this.documentVulgarizationClient.pollBatch(
        resource.anthropicBatchId as string,
      );

      if (result.status === 'pending') {
        return;
      }

      if (result.status === 'succeeded') {
        await this.prisma.$transaction(async (tx) => {
          for (const v of result.vulgarizations) {
            await tx.resourceVulgarization.upsert({
              where: {
                resourceId_locale: {
                  resourceId: resource.id,
                  locale: v.locale,
                },
              },
              create: {
                resourceId: resource.id,
                locale: v.locale,
                title: v.title,
                content: v.content,
              },
              update: { title: v.title, content: v.content },
            });
          }
          // specs/013-ai-resource-categorization: a proposed category is
          // best-effort by design (the client already degrades a failed/
          // malformed category result to an empty array — see
          // DocumentVulgarizationClient.pollBatch) — this loop simply has
          // nothing to do when there are none, never blocking the
          // vulgarization content above from reaching ready_for_review.
          for (const proposal of result.categories) {
            const category = await tx.resourceCategory.upsert({
              where: {
                projectId_key: {
                  projectId: resource.projectId,
                  key: proposal.key,
                },
              },
              create: {
                projectId: resource.projectId,
                key: proposal.key,
                labelEn: proposal.labelEn,
                labelFr: proposal.labelFr,
              },
              // Existing labels win — reusing a key (research.md Decision 2)
              // is about matching the type of information, not letting a
              // later resource silently rename an already-established
              // category out from under earlier ones.
              update: {},
            });
            await tx.resourceCategoryAssignment.upsert({
              where: {
                resourceId_categoryId: {
                  resourceId: resource.id,
                  categoryId: category.id,
                },
              },
              create: {
                resourceId: resource.id,
                categoryId: category.id,
                status: 'proposed',
              },
              update: {},
            });
          }
          await tx.resource.update({
            where: { id: resource.id },
            data: { status: 'ready_for_review', anthropicBatchId: null },
          });
        });
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
      // One broken resource must not abort the sweep for every other one
      // (mirrors TaskVulgarizationService.processConnection()) — log and
      // move on; the next sweep retries.
      this.logger.warn(
        `Failed to poll batch for resource ${resource.id}: ${String(error)}`,
      );
    }
  }
}
