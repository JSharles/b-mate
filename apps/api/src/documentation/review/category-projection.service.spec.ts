import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { GenerationService } from '../../generation/generation.service';
import { CategoryProjectionService } from './category-projection.service';
const projectId = '00000000-0000-4000-8000-000000000001';
const revisionId = '00000000-0000-4000-8000-000000000002';
describe('CategoryProjectionService', () => {
  it('queues one revision-pinned draft and atomically claims the projection', async () => {
    const prisma = createPrismaMock();
    const generation = {
      createInTransaction: jest.fn().mockResolvedValue({ id: 'operation' }),
    };
    prisma.categoryProjectionState.findUnique.mockResolvedValue({
      activeDraftId: null,
      targetSourceRevisionId: revisionId,
    });
    prisma.sourceRevision.findUnique.mockResolvedValue({
      items: [
        {
          informationItemId: 'item',
          kind: 'fact',
          state: 'confirmed',
          content: 'Fact',
          categories: [{ categoryKey: 'overview' }],
        },
      ],
    });
    prisma.documentationCategoryReferenceDraft.findMany.mockResolvedValue([]);
    prisma.documentationCategoryReferenceDraft.create.mockResolvedValue({
      id: 'draft',
    });
    prisma.categoryProjectionState.updateMany.mockResolvedValue({ count: 1 });
    const service = new CategoryProjectionService(
      asPrismaService(prisma),
      generation as unknown as GenerationService,
    );
    await expect(
      service.queue(projectId, 'overview', revisionId, 'document_added'),
    ).resolves.toBe('draft');
    expect(generation.createInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sourceRevisionId: revisionId,
        type: 'factual_drafting',
      }),
    );
  });
  it('does not overwrite an active or stale target draft', async () => {
    const prisma = createPrismaMock();
    prisma.categoryProjectionState.findUnique.mockResolvedValue({
      activeDraftId: 'existing',
      targetSourceRevisionId: revisionId,
    });
    const service = new CategoryProjectionService(
      asPrismaService(prisma),
      {} as GenerationService,
    );
    await expect(
      service.queue(projectId, 'overview', revisionId, 'catch_up'),
    ).resolves.toBeNull();
    expect(
      prisma.documentationCategoryReferenceDraft.create,
    ).not.toHaveBeenCalled();
  });
  it.each([
    [null, revisionId],
    [{ activeDraftId: null, targetSourceRevisionId: 'different' }, revisionId],
  ])(
    'does not queue when the projection is missing or moved',
    async (state, target) => {
      const prisma = createPrismaMock();
      prisma.categoryProjectionState.findUnique.mockResolvedValue(state);
      const service = new CategoryProjectionService(
        asPrismaService(prisma),
        {} as GenerationService,
      );
      await expect(
        service.queue(projectId, 'overview', target, 'catch_up'),
      ).resolves.toBeNull();
      expect(prisma.sourceRevision.findUnique).not.toHaveBeenCalled();
    },
  );

  it('does not queue a missing immutable source revision', async () => {
    const prisma = createPrismaMock();
    prisma.categoryProjectionState.findUnique.mockResolvedValue({
      activeDraftId: null,
      targetSourceRevisionId: revisionId,
    });
    prisma.sourceRevision.findUnique.mockResolvedValue(null);
    const service = new CategoryProjectionService(
      asPrismaService(prisma),
      {} as GenerationService,
    );
    await expect(
      service.queue(projectId, 'overview', revisionId, 'catch_up'),
    ).resolves.toBeNull();
  });

  it('fails the transaction when the final projection claim loses a race', async () => {
    const prisma = createPrismaMock();
    const generation = {
      createInTransaction: jest.fn().mockResolvedValue({ id: 'operation' }),
    };
    prisma.categoryProjectionState.findUnique.mockResolvedValue({
      activeDraftId: null,
      targetSourceRevisionId: revisionId,
    });
    prisma.sourceRevision.findUnique.mockResolvedValue({ items: [] });
    prisma.documentationCategoryReferenceDraft.findMany.mockResolvedValue([]);
    prisma.documentationCategoryReferenceDraft.create.mockResolvedValue({
      id: 'draft',
    });
    prisma.categoryProjectionState.updateMany.mockResolvedValue({ count: 0 });
    const service = new CategoryProjectionService(
      asPrismaService(prisma),
      generation as unknown as GenerationService,
    );
    await expect(
      service.queue(projectId, 'overview', revisionId, 'catch_up'),
    ).rejects.toThrow('CATEGORY_PROJECTION_CHANGED');
  });
  it('includes the contributor correction in a replacement draft fingerprint', async () => {
    const prisma = createPrismaMock();
    const generation = {
      createInTransaction: jest.fn().mockResolvedValue({ id: 'operation' }),
    };
    prisma.categoryProjectionState.findUnique.mockResolvedValue({
      activeDraftId: null,
      targetSourceRevisionId: revisionId,
    });
    prisma.sourceRevision.findUnique.mockResolvedValue({ items: [] });
    prisma.documentationCategoryReferenceDraft.findMany.mockResolvedValue([]);
    prisma.categoryDraftReview.findFirst.mockResolvedValue({
      instruction: 'La date correcte est le 12 septembre.',
    });
    prisma.documentationCategoryReferenceDraft.create.mockResolvedValue({
      id: 'replacement-draft',
    });
    prisma.categoryProjectionState.updateMany.mockResolvedValue({ count: 1 });
    const service = new CategoryProjectionService(
      asPrismaService(prisma),
      generation as unknown as GenerationService,
    );

    await service.queue(
      projectId,
      'overview',
      revisionId,
      'factual_correction',
      'parent-draft',
    );

    expect(prisma.categoryDraftReview.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { draftId: 'parent-draft', kind: 'correction_requested' },
      }),
    );
    expect(generation.createInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        inputFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/u),
      }),
    );
  });
  it('ensures every unclaimed target and catches up only when behind', async () => {
    const prisma = createPrismaMock();
    const service = new CategoryProjectionService(
      asPrismaService(prisma),
      {} as GenerationService,
    );
    const queue = jest.spyOn(service, 'queue').mockResolvedValue('draft');
    prisma.categoryProjectionState.findMany.mockResolvedValue([
      {
        projectId,
        categoryKey: 'overview',
        targetSourceRevisionId: revisionId,
        activeDraftId: null,
      },
    ]);
    await service.ensurePendingDrafts(projectId);
    prisma.categoryProjectionState.findUnique.mockResolvedValue({
      projectId,
      categoryKey: 'overview',
      targetSourceRevisionId: revisionId,
      activeDraftId: null,
      lastReviewedSourceRevisionId: null,
    });
    await service.catchUp(projectId, 'overview');
    expect(queue).toHaveBeenCalledTimes(2);
  });

  it('does not catch up an already active, reviewed, or targetless projection', async () => {
    const prisma = createPrismaMock();
    const service = new CategoryProjectionService(
      asPrismaService(prisma),
      {} as GenerationService,
    );
    const queue = jest.spyOn(service, 'queue');
    for (const state of [
      null,
      {
        targetSourceRevisionId: null,
        activeDraftId: null,
        lastReviewedSourceRevisionId: null,
      },
      {
        targetSourceRevisionId: revisionId,
        activeDraftId: 'draft',
        lastReviewedSourceRevisionId: null,
      },
      {
        targetSourceRevisionId: revisionId,
        activeDraftId: null,
        lastReviewedSourceRevisionId: revisionId,
      },
    ]) {
      prisma.categoryProjectionState.findUnique.mockResolvedValueOnce(state);
      await service.catchUp(projectId, 'overview');
    }
    expect(queue).not.toHaveBeenCalled();
  });
  // Catching up only ever happened when a contributor accepted or discarded a
  // draft. A category whose generation died was stranded: slot freed, revision
  // undrafted, nobody left to ask — and every later revision found nothing to
  // review under that tab.
  it('re-queues a category left with nothing in flight and a revision to draft', async () => {
    const prisma = createPrismaMock();
    const generation = {
      createInTransaction: jest.fn().mockResolvedValue({ id: 'operation' }),
    };
    prisma.categoryProjectionState.findMany.mockResolvedValue([
      {
        projectId,
        categoryKey: 'overview',
        activeDraftId: null,
        targetSourceRevisionId: revisionId,
        lastReviewedSourceRevisionId: null,
      },
    ]);
    prisma.documentationCategoryReferenceDraft.count.mockResolvedValue(0);
    prisma.categoryProjectionState.findUnique.mockResolvedValue({
      activeDraftId: null,
      targetSourceRevisionId: revisionId,
      lastReviewedSourceRevisionId: null,
    });
    prisma.sourceRevision.findUnique.mockResolvedValue({ items: [] });
    prisma.documentationCategoryReferenceDraft.findMany.mockResolvedValue([]);
    prisma.documentationCategoryReferenceDraft.create.mockResolvedValue({
      id: 'draft',
    });
    prisma.categoryProjectionState.updateMany.mockResolvedValue({ count: 1 });
    const service = new CategoryProjectionService(
      asPrismaService(prisma),
      generation as unknown as GenerationService,
    );

    await service.recoverStrandedCategories();

    expect(generation.createInTransaction).toHaveBeenCalled();
  });

  // A revision whose draft genuinely failed is the contributor's to act on,
  // not something to re-run every thirty seconds.
  it('leaves a revision alone once its draft has failed', async () => {
    const prisma = createPrismaMock();
    const generation = { createInTransaction: jest.fn() };
    prisma.categoryProjectionState.findMany.mockResolvedValue([
      {
        projectId,
        categoryKey: 'overview',
        activeDraftId: null,
        targetSourceRevisionId: revisionId,
        lastReviewedSourceRevisionId: null,
      },
    ]);
    prisma.documentationCategoryReferenceDraft.count.mockResolvedValue(1);
    const service = new CategoryProjectionService(
      asPrismaService(prisma),
      generation as unknown as GenerationService,
    );

    await service.recoverStrandedCategories();

    expect(generation.createInTransaction).not.toHaveBeenCalled();
  });
});
