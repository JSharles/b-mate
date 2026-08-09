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
          // specs/014-category-sections: upserted on (resourceId,
          // categoryKey) so a re-poll of the same batch — which happens
          // whenever a sweep is interrupted after the API call but before the
          // transaction commits — updates rather than duplicating.
          //
          // `position` is the order the analysis returned the sections in,
          // which is what breaks ties when several of a resource's sections
          // land in the same client tab (FR-022).
          for (const [position, section] of result.sections.entries()) {
            await tx.resourceSection.upsert({
              where: {
                resourceId_categoryKey: {
                  resourceId: resource.id,
                  categoryKey: section.categoryKey,
                },
              },
              create: {
                resourceId: resource.id,
                categoryKey: section.categoryKey,
                position,
                titleEn: section.titleEn,
                contentEn: section.contentEn,
                titleFr: section.titleFr,
                contentFr: section.contentFr,
              },
              // Deliberately does not reset `status`: re-persisting content a
              // contributor has already approved or rejected must not quietly
              // return it to the review queue.
              update: {
                position,
                titleEn: section.titleEn,
                contentEn: section.contentEn,
                titleFr: section.titleFr,
                contentFr: section.contentFr,
              },
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
