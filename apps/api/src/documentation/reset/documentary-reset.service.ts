import { ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { DocumentaryResetItemStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DocumentStorageClient } from '../source/document-storage.client';
import { DocumentaryTransitionService } from './documentary-transition.service';

export const DOCUMENTARY_RESET_FEATURE_KEY = '016-canonical-document-workflow';

export const LEGACY_DOCUMENTARY_PURGE_ORDER = [
  'reference_questions',
  'category_reference_drafts',
  'category_contents',
  'category_references',
  'category_extracts',
  'resources',
] as const;

export interface LegacyDocumentaryInventoryRow {
  resourceId: string;
  objectKey: string | null;
}

export interface LegacyDocumentaryCounts {
  referenceQuestions: number;
  categoryReferenceDrafts: number;
  categoryContents: number;
  categoryReferences: number;
  categoryExtracts: number;
  resources: number;
  [key: string]: number;
}

export interface DocumentaryResetReport {
  featureKey: string;
  status: 'inventoried' | 'clean';
  digest: string;
  resources: LegacyDocumentaryInventoryRow[];
  counts: LegacyDocumentaryCounts | Record<string, number>;
}

const SUCCESSFUL_ITEM_STATUSES = new Set<DocumentaryResetItemStatus>([
  'deleted',
  'already_absent',
]);

@Injectable()
export class DocumentaryResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageClient,
    private readonly transition: DocumentaryTransitionService,
  ) {}

  async dryRun(featureKey: string): Promise<DocumentaryResetReport> {
    this.assertFeatureKey(featureKey);
    await this.transition.getRequiredState();
    const inventory = await this.readInventory();

    return {
      featureKey,
      status: 'inventoried',
      digest: this.digest(featureKey, inventory.resources, inventory.counts),
      resources: inventory.resources,
      counts: inventory.counts,
    };
  }

  async confirm(
    featureKey: string,
    approvedDigest: string,
  ): Promise<DocumentaryResetReport> {
    this.assertFeatureKey(featureKey);
    if (!/^[a-f0-9]{64}$/.test(approvedDigest)) {
      throw new ConflictException(
        'An exact approved inventory digest is required.',
      );
    }

    const transitionState = await this.transition.getRequiredState();
    if (transitionState.mode === 'canonical') {
      return this.readCompletedRun(featureKey, approvedDigest);
    }
    const inventory = await this.readInventory();
    const currentDigest = this.digest(
      featureKey,
      inventory.resources,
      inventory.counts,
    );
    if (approvedDigest !== currentDigest) {
      throw new ConflictException(
        'The documentary inventory changed after approval.',
      );
    }

    const expectedDatabaseRows = Object.values(inventory.counts).reduce(
      (total, count) => total + count,
      0,
    );
    const run = await this.prisma.documentaryResetRun.upsert({
      where: { featureKey },
      create: {
        featureKey,
        status: 'inventoried',
        approvedInventoryDigest: approvedDigest,
        storageExpectedCount: inventory.resources.filter(
          ({ objectKey }) => objectKey !== null,
        ).length,
        databaseExpectedRows: expectedDatabaseRows,
      },
      update: {
        status: 'inventoried',
        approvedInventoryDigest: approvedDigest,
        storageExpectedCount: inventory.resources.filter(
          ({ objectKey }) => objectKey !== null,
        ).length,
        storageFailedCount: 0,
        databaseExpectedRows: expectedDatabaseRows,
        completedAt: null,
      },
    });

    await this.transition.beginReset({
      runId: run.id,
      approvedDigest,
      currentDigest,
    });

    await this.deleteStoredOriginals(run.id, inventory.resources);
    await this.purgeLegacyRows(run.id);
    await this.transition.completeReset(run.id);

    await this.prisma.documentaryResetRun.update({
      where: { id: run.id },
      data: {
        status: 'clean',
        databaseDeletedRows: expectedDatabaseRows,
        completedAt: new Date(),
      },
    });

    return {
      featureKey,
      status: 'clean',
      digest: approvedDigest,
      resources: inventory.resources,
      counts: inventory.counts,
    };
  }

  private async readCompletedRun(
    featureKey: string,
    approvedDigest: string,
  ): Promise<DocumentaryResetReport> {
    const completedRun = await this.prisma.documentaryResetRun.findUnique({
      where: { featureKey },
    });
    if (
      completedRun?.status !== 'clean' ||
      completedRun.approvedInventoryDigest !== approvedDigest
    ) {
      throw new ConflictException(
        'The canonical documentary transition does not match this reset confirmation.',
      );
    }

    const inventory = await this.readInventory();
    if (
      inventory.resources.length !== 0 ||
      Object.values(inventory.counts).some((count) => count !== 0)
    ) {
      throw new ConflictException(
        'Legacy documentary data remains after the canonical transition.',
      );
    }

    return {
      featureKey,
      status: 'clean',
      digest: approvedDigest,
      resources: inventory.resources,
      counts: inventory.counts,
    };
  }

  private async deleteStoredOriginals(
    runId: string,
    resources: LegacyDocumentaryInventoryRow[],
  ): Promise<void> {
    await this.prisma.documentaryResetRun.update({
      where: { id: runId },
      data: { status: 'storage_deleting' },
    });

    const existing = await this.prisma.documentaryResetItem.findMany({
      where: { resetRunId: runId },
      select: { legacyResourceId: true, status: true },
    });
    const statusByResource = new Map(
      existing.map((item) => [item.legacyResourceId, item.status]),
    );
    let deletedCount = existing.filter((item) =>
      SUCCESSFUL_ITEM_STATUSES.has(item.status),
    ).length;

    for (const resource of resources) {
      await this.prisma.documentaryResetItem.upsert({
        where: {
          resetRunId_legacyResourceId: {
            resetRunId: runId,
            legacyResourceId: resource.resourceId,
          },
        },
        create: {
          resetRunId: runId,
          legacyResourceId: resource.resourceId,
          objectKey: resource.objectKey,
        },
        update: { objectKey: resource.objectKey },
      });

      const priorStatus = statusByResource.get(resource.resourceId);
      if (priorStatus && SUCCESSFUL_ITEM_STATUSES.has(priorStatus)) {
        continue;
      }

      if (resource.objectKey === null) {
        await this.markStorageSuccess(
          runId,
          resource.resourceId,
          'already_absent',
          ++deletedCount,
        );
        continue;
      }

      try {
        await this.storage.delete(resource.objectKey);
        await this.markStorageSuccess(
          runId,
          resource.resourceId,
          'deleted',
          ++deletedCount,
        );
      } catch (error) {
        const diagnostic = this.boundedDiagnostic(error);
        await this.prisma.documentaryResetItem.update({
          where: {
            resetRunId_legacyResourceId: {
              resetRunId: runId,
              legacyResourceId: resource.resourceId,
            },
          },
          data: {
            status: 'failed',
            diagnostic,
            attemptCount: { increment: 1 },
          },
        });
        await this.prisma.documentaryResetRun.update({
          where: { id: runId },
          data: {
            status: 'storage_failed',
            storageDeletedCount: deletedCount,
            storageFailedCount: { increment: 1 },
          },
        });
        throw error;
      }
    }
  }

  private async markStorageSuccess(
    runId: string,
    legacyResourceId: string,
    status: Extract<DocumentaryResetItemStatus, 'deleted' | 'already_absent'>,
    deletedCount: number,
  ): Promise<void> {
    await this.prisma.documentaryResetItem.update({
      where: {
        resetRunId_legacyResourceId: { resetRunId: runId, legacyResourceId },
      },
      data: {
        status,
        diagnostic: null,
        attemptCount: { increment: 1 },
      },
    });
    await this.prisma.documentaryResetRun.update({
      where: { id: runId },
      data: { storageDeletedCount: deletedCount },
    });
  }

  private async purgeLegacyRows(runId: string): Promise<void> {
    await this.prisma.documentaryResetRun.update({
      where: { id: runId },
      data: { status: 'database_purging' },
    });

    try {
      await this.prisma.$transaction(
        async (tx) => {
          for (const table of LEGACY_DOCUMENTARY_PURGE_ORDER) {
            await tx.$executeRawUnsafe(`DELETE FROM "${table}"`);
          }
          const remaining = await this.readCounts(tx);
          if (Object.values(remaining).some((count) => count !== 0)) {
            throw new Error('One or more legacy documentary rows remain.');
          }
        },
        { isolationLevel: 'Serializable', maxWait: 30_000, timeout: 120_000 },
      );
    } catch (error) {
      await this.prisma.documentaryResetRun.update({
        where: { id: runId },
        data: { status: 'database_failed' },
      });
      throw error;
    }
  }

  private async readInventory(): Promise<{
    resources: LegacyDocumentaryInventoryRow[];
    counts: LegacyDocumentaryCounts;
  }> {
    const resources = await this.prisma.$queryRaw<
      LegacyDocumentaryInventoryRow[]
    >`
      SELECT
        "resource_id" AS "resourceId",
        "object_key" AS "objectKey"
      FROM "documentary_legacy_resource_inventory"
      ORDER BY "resource_id"
    `;
    return { resources, counts: await this.readCounts(this.prisma) };
  }

  private async readCounts(
    client: Pick<Prisma.TransactionClient, '$queryRaw'>,
  ): Promise<LegacyDocumentaryCounts> {
    const rows = await client.$queryRaw<LegacyDocumentaryCounts[]>`
      SELECT
        (SELECT COUNT(*)::int FROM "reference_questions") AS "referenceQuestions",
        (SELECT COUNT(*)::int FROM "category_reference_drafts") AS "categoryReferenceDrafts",
        (SELECT COUNT(*)::int FROM "category_contents") AS "categoryContents",
        (SELECT COUNT(*)::int FROM "category_references") AS "categoryReferences",
        (SELECT COUNT(*)::int FROM "category_extracts") AS "categoryExtracts",
        (SELECT COUNT(*)::int FROM "resources") AS "resources"
    `;
    const counts = rows[0];
    if (!counts) {
      throw new Error('Unable to read the legacy documentary inventory.');
    }
    return counts;
  }

  private digest(
    featureKey: string,
    resources: LegacyDocumentaryInventoryRow[],
    counts: LegacyDocumentaryCounts,
  ): string {
    const stableResources = [...resources].sort((a, b) =>
      a.resourceId.localeCompare(b.resourceId),
    );
    const stableCounts = Object.fromEntries(
      Object.entries(counts).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    );
    return createHash('sha256')
      .update(JSON.stringify({ featureKey, stableResources, stableCounts }))
      .digest('hex');
  }

  private boundedDiagnostic(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(
      0,
      1000,
    );
  }

  private assertFeatureKey(featureKey: string): void {
    if (featureKey !== DOCUMENTARY_RESET_FEATURE_KEY) {
      throw new ConflictException('Unsupported documentary reset feature key.');
    }
  }
}
