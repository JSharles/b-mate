import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../../test/prisma-mock';
import { DocumentStorageClient } from '../source/document-storage.client';
import {
  DocumentaryTransitionService,
  DocumentaryTransitionUnavailableError,
} from './documentary-transition.service';
import {
  DocumentaryResetService,
  LEGACY_DOCUMENTARY_PURGE_ORDER,
} from './documentary-reset.service';

type ResetDelegates = {
  documentaryResetRun: Record<string, jest.Mock>;
  documentaryResetItem: Record<string, jest.Mock>;
  executeRawUnsafe: jest.Mock;
};

function addResetDelegates(prisma: PrismaMock): ResetDelegates {
  const delegates = {
    documentaryResetRun: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    documentaryResetItem: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    executeRawUnsafe: jest.fn(),
  };
  Object.assign(prisma, {
    documentaryResetRun: delegates.documentaryResetRun,
    documentaryResetItem: delegates.documentaryResetItem,
    $executeRawUnsafe: delegates.executeRawUnsafe,
  });
  return delegates;
}

const inventoryRows = [
  {
    resourceId: '00000000-0000-4000-8000-000000000101',
    objectKey: 'resources/project-1/brief.pdf',
  },
  {
    resourceId: '00000000-0000-4000-8000-000000000102',
    objectKey: null,
  },
];

const legacyCounts = {
  referenceQuestions: 2,
  categoryReferenceDrafts: 1,
  categoryContents: 1,
  categoryReferences: 1,
  categoryExtracts: 2,
  resources: 2,
};

const zeroCounts = Object.fromEntries(
  Object.keys(legacyCounts).map((key) => [key, 0]),
);

describe('DocumentaryResetService', () => {
  let prisma: PrismaMock;
  let reset: ResetDelegates;
  let storage: jest.Mocked<Pick<DocumentStorageClient, 'delete'>>;
  let transition: jest.Mocked<
    Pick<
      DocumentaryTransitionService,
      'getRequiredState' | 'beginReset' | 'completeReset'
    >
  >;
  let service: DocumentaryResetService;

  beforeEach(() => {
    prisma = createPrismaMock();
    reset = addResetDelegates(prisma);
    storage = { delete: jest.fn() };
    transition = {
      getRequiredState: jest.fn().mockResolvedValue({ mode: 'legacy' }),
      beginReset: jest.fn(),
      completeReset: jest.fn(),
    };
    reset.documentaryResetRun.upsert.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
    });
    reset.documentaryResetItem.findMany.mockResolvedValue([]);
    service = new DocumentaryResetService(
      asPrismaService(prisma),
      storage as unknown as DocumentStorageClient,
      transition as unknown as DocumentaryTransitionService,
    );
  });

  function mockInventory(
    counts: Record<string, number> = legacyCounts,
    resources = inventoryRows,
  ) {
    prisma.$queryRaw
      .mockResolvedValueOnce(resources)
      .mockResolvedValueOnce([counts]);
  }

  it('keeps dry-run strictly read-only and returns a stable inventory digest', async () => {
    mockInventory();

    const report = await service.dryRun('016-canonical-document-workflow');

    expect(report.digest).toMatch(/^[a-f0-9]{64}$/);
    expect(report.resources).toEqual(inventoryRows);
    expect(report.counts).toEqual(legacyCounts);
    expect(reset.documentaryResetRun.upsert).not.toHaveBeenCalled();
    expect(reset.documentaryResetItem.upsert).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(reset.executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('rejects a changed inventory before deleting storage or database rows', async () => {
    mockInventory();

    await expect(
      service.confirm('016-canonical-document-workflow', 'wrong-digest'),
    ).rejects.toThrow('inventory');

    expect(transition.beginReset).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(reset.executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('deletes R2 originals idempotently, purges in dependency order, and completes cleanly', async () => {
    mockInventory();
    const dryRun = await service.dryRun('016-canonical-document-workflow');
    mockInventory();
    prisma.$queryRaw.mockResolvedValueOnce([zeroCounts]);

    const report = await service.confirm(
      '016-canonical-document-workflow',
      dryRun.digest,
    );

    expect(transition.beginReset).toHaveBeenCalledWith(
      expect.objectContaining({
        approvedDigest: dryRun.digest,
        currentDigest: dryRun.digest,
      }),
    );
    expect(storage.delete).toHaveBeenCalledWith(
      'resources/project-1/brief.pdf',
    );
    const purgeCalls = reset.executeRawUnsafe.mock.calls as unknown[][];
    expect(purgeCalls).toHaveLength(LEGACY_DOCUMENTARY_PURGE_ORDER.length);
    LEGACY_DOCUMENTARY_PURGE_ORDER.forEach((table, index) => {
      expect(String(purgeCalls[index]?.[0])).toContain(table);
    });
    expect(transition.completeReset).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
    );
    expect(report.status).toBe('clean');
  });

  it('leaves transition resetting and records a retryable storage failure', async () => {
    mockInventory();
    const dryRun = await service.dryRun('016-canonical-document-workflow');
    mockInventory();
    storage.delete.mockRejectedValue(new Error('R2 unavailable'));

    await expect(
      service.confirm('016-canonical-document-workflow', dryRun.digest),
    ).rejects.toThrow('R2 unavailable');

    const storageUpdateCalls = reset.documentaryResetRun.update.mock
      .calls as unknown[][];
    const storageFailureCall = storageUpdateCalls.at(-1)?.[0] as {
      data: { status: string };
    };
    expect(storageFailureCall.data.status).toBe('storage_failed');
    expect(transition.completeReset).not.toHaveBeenCalled();
  });

  it('does not repeat a storage deletion already recorded as successful', async () => {
    mockInventory();
    const dryRun = await service.dryRun('016-canonical-document-workflow');
    mockInventory();
    reset.documentaryResetItem.findMany.mockResolvedValue([
      {
        legacyResourceId: inventoryRows[0].resourceId,
        status: 'deleted',
      },
    ]);
    prisma.$queryRaw.mockResolvedValueOnce([zeroCounts]);

    await service.confirm('016-canonical-document-workflow', dryRun.digest);

    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('returns an already clean canonical reset without mutating or purging again', async () => {
    const approvedDigest = 'a'.repeat(64);
    transition.getRequiredState.mockResolvedValue({
      id: 'documentary-transition',
      mode: 'canonical',
      version: 3,
      activeResetRunId: null,
      approvedInventoryDigest: approvedDigest,
      writeFreezeAt: new Date('2026-08-11T00:00:00.000Z'),
      canonicalizedAt: new Date('2026-08-11T00:01:00.000Z'),
      createdAt: new Date('2026-08-11T00:00:00.000Z'),
      updatedAt: new Date('2026-08-11T00:01:00.000Z'),
    });
    reset.documentaryResetRun.findUnique.mockResolvedValue({
      status: 'clean',
      approvedInventoryDigest: approvedDigest,
    });
    mockInventory(zeroCounts, []);

    await expect(
      service.confirm('016-canonical-document-workflow', approvedDigest),
    ).resolves.toMatchObject({ status: 'clean', digest: approvedDigest });

    expect(reset.documentaryResetRun.upsert).not.toHaveBeenCalled();
    expect(transition.beginReset).not.toHaveBeenCalled();
    expect(transition.completeReset).not.toHaveBeenCalled();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(reset.executeRawUnsafe).not.toHaveBeenCalled();
  });

  it('refuses to mark the run clean while any legacy row survives', async () => {
    mockInventory();
    const dryRun = await service.dryRun('016-canonical-document-workflow');
    mockInventory();
    prisma.$queryRaw.mockResolvedValueOnce([{ ...zeroCounts, resources: 1 }]);

    await expect(
      service.confirm('016-canonical-document-workflow', dryRun.digest),
    ).rejects.toThrow('legacy');

    const databaseUpdateCalls = reset.documentaryResetRun.update.mock
      .calls as unknown[][];
    const databaseFailureCall = databaseUpdateCalls.at(-1)?.[0] as {
      data: { status: string };
    };
    expect(databaseFailureCall.data.status).toBe('database_failed');
    expect(transition.completeReset).not.toHaveBeenCalled();
  });

  it('aborts safely if transition state is unavailable', async () => {
    transition.getRequiredState.mockRejectedValue(
      new DocumentaryTransitionUnavailableError(),
    );

    await expect(
      service.dryRun('016-canonical-document-workflow'),
    ).rejects.toBeInstanceOf(DocumentaryTransitionUnavailableError);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('never includes non-documentary tables in the destructive purge order', () => {
    expect(LEGACY_DOCUMENTARY_PURGE_ORDER).toEqual([
      'reference_questions',
      'category_reference_drafts',
      'category_contents',
      'category_references',
      'category_extracts',
      'resources',
    ]);
    expect(LEGACY_DOCUMENTARY_PURGE_ORDER).not.toEqual(
      expect.arrayContaining([
        'users',
        'projects',
        'project_members',
        'invitations',
        'board_connections',
        'notion_connections',
        'vulgarized_tasks',
      ]),
    );
  });
});
