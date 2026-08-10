import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../test/prisma-mock';
import { ReferenceAnalysisClient } from './reference-analysis.client';
import type { ResourceCategoryKey } from './resource-categories';
import { ResourceBatchSweepService } from './resource-batch-sweep.service';

const pendingResource = {
  id: 'resource-1',
  projectId: 'project-1',
  source: 'upload' as const,
  status: 'pending' as const,
  title: 'Architecture overview',
  anthropicBatchId: 'batch_123',
};

function update(categoryKey: ResourceCategoryKey, suffix: string) {
  return {
    categoryKey,
    extract: `Extract ${suffix}`,
    reference: `Merged reference ${suffix}`,
  };
}

describe('ResourceBatchSweepService', () => {
  let prisma: PrismaMock;
  let referenceAnalysisClient: jest.Mocked<
    Pick<ReferenceAnalysisClient, 'pollIngestion'>
  >;
  let service: ResourceBatchSweepService;

  beforeEach(() => {
    prisma = createPrismaMock();
    prisma.categoryReferenceDraft.findMany.mockResolvedValue([]);
    // The upsert's return value is used: questions attach to the draft row it
    // creates or updates.
    prisma.categoryReferenceDraft.upsert.mockResolvedValue({ id: 'draft-1' });
    prisma.categoryReference.findMany.mockResolvedValue([]);
    referenceAnalysisClient = { pollIngestion: jest.fn() };
    service = new ResourceBatchSweepService(
      asPrismaService(prisma),
      referenceAnalysisClient as unknown as ReferenceAnalysisClient,
    );
  });

  it('polls every document still pending with a batch id', async () => {
    prisma.resource.findMany.mockResolvedValue([pendingResource]);
    referenceAnalysisClient.pollIngestion.mockResolvedValue({
      status: 'pending',
    });

    await service.sweep();

    expect(prisma.resource.findMany).toHaveBeenCalledWith({
      where: { status: 'pending', anthropicBatchId: { not: null } },
    });
    expect(referenceAnalysisClient.pollIngestion).toHaveBeenCalledWith(
      'batch_123',
    );
  });

  it('leaves everything alone while the batch is still running', async () => {
    prisma.resource.findMany.mockResolvedValue([pendingResource]);
    referenceAnalysisClient.pollIngestion.mockResolvedValue({
      status: 'pending',
    });

    await service.sweep();

    expect(prisma.resource.update).not.toHaveBeenCalled();
    expect(prisma.categoryExtract.upsert).not.toHaveBeenCalled();
    expect(prisma.categoryReferenceDraft.upsert).not.toHaveBeenCalled();
  });

  it('stores one extract and one draft per returned category, then marks the document absorbed', async () => {
    prisma.resource.findMany.mockResolvedValue([pendingResource]);
    referenceAnalysisClient.pollIngestion.mockResolvedValue({
      status: 'succeeded',
      categories: [update('overview', 'A'), update('planning', 'B')],
    });

    await service.sweep();

    expect(prisma.categoryExtract.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.categoryExtract.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          resourceId_categoryKey: {
            resourceId: 'resource-1',
            categoryKey: 'overview',
          },
        },
        create: expect.objectContaining({ content: 'Extract A' }) as unknown,
      }),
    );
    expect(prisma.categoryReferenceDraft.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId_categoryKey: {
            projectId: 'project-1',
            categoryKey: 'overview',
          },
        },
        create: expect.objectContaining({
          content: 'Merged reference A',
          trigger: 'document_added',
          triggerResourceId: 'resource-1',
        }) as unknown,
      }),
    );
    expect(prisma.resource.update).toHaveBeenCalledWith({
      where: { id: 'resource-1' },
      data: { status: 'absorbed', anthropicBatchId: null },
    });
  });

  // spec Edge Cases: this document's merged body was computed against the
  // *live* reference, so it knows nothing of a draft already awaiting review.
  // Overwriting that draft would silently discard the other document's work.
  it('keeps the extract but does not touch a category that already has a pending draft', async () => {
    prisma.resource.findMany.mockResolvedValue([pendingResource]);
    prisma.categoryReferenceDraft.findMany.mockResolvedValue([
      { categoryKey: 'overview' },
    ]);
    referenceAnalysisClient.pollIngestion.mockResolvedValue({
      status: 'succeeded',
      categories: [update('overview', 'A'), update('planning', 'B')],
    });

    await service.sweep();

    // Both extracts are kept — the blocked category is rebuilt from them later.
    expect(prisma.categoryExtract.upsert).toHaveBeenCalledTimes(2);
    // Only the unblocked category gets a draft.
    expect(prisma.categoryReferenceDraft.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.categoryReferenceDraft.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId_categoryKey: {
            projectId: 'project-1',
            categoryKey: 'planning',
          },
        },
      }),
    );
  });

  // A sweep interrupted between the API call and the commit re-polls the same
  // ended batch; the upsert keys are what stop that duplicating rows.
  it('upserts rather than duplicating when the same batch is polled twice', async () => {
    prisma.resource.findMany.mockResolvedValue([pendingResource]);
    referenceAnalysisClient.pollIngestion.mockResolvedValue({
      status: 'succeeded',
      categories: [update('overview', 'A')],
    });

    await service.sweep();
    await service.sweep();

    for (const [arg] of prisma.categoryExtract.upsert.mock.calls as [
      { where: unknown; update: unknown },
    ][]) {
      expect(arg.where).toBeDefined();
      expect(arg.update).toBeDefined();
    }
  });

  it('fails the document with a readable reason and leaves live content untouched', async () => {
    prisma.resource.findMany.mockResolvedValue([pendingResource]);
    referenceAnalysisClient.pollIngestion.mockResolvedValue({
      status: 'failed',
      reason:
        'This document did not contribute anything to the project documentation.',
    });

    await service.sweep();

    expect(prisma.resource.update).toHaveBeenCalledWith({
      where: { id: 'resource-1' },
      data: {
        status: 'failed',
        failureReason:
          'This document did not contribute anything to the project documentation.',
        anthropicBatchId: null,
      },
    });
    expect(prisma.categoryExtract.upsert).not.toHaveBeenCalled();
    expect(prisma.categoryReference.upsert).not.toHaveBeenCalled();
  });

  // specs/015 US5. A question exists to be answered before validation, so the
  // draft has to say it is waiting on one — but `awaiting_answers` is still a
  // reviewable state: it flags, it does not block (FR-023).
  it('records the questions against the draft and marks it awaiting answers', async () => {
    prisma.resource.findMany.mockResolvedValue([pendingResource]);
    referenceAnalysisClient.pollIngestion.mockResolvedValue({
      status: 'succeeded',
      categories: [
        {
          categoryKey: 'planning',
          extract: 'Extract',
          reference: 'Reference',
          questions: [{ question: 'February or March?', rank: 1 }],
        },
      ],
    });

    await service.sweep();

    expect(prisma.categoryReferenceDraft.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'awaiting_answers',
        }) as unknown,
      }),
    );
    expect(prisma.referenceQuestion.createMany).toHaveBeenCalledWith({
      data: [{ draftId: 'draft-1', question: 'February or March?', rank: 1 }],
    });
  });

  it('leaves a draft plainly reviewable when nothing needed asking', async () => {
    prisma.resource.findMany.mockResolvedValue([pendingResource]);
    referenceAnalysisClient.pollIngestion.mockResolvedValue({
      status: 'succeeded',
      categories: [
        { categoryKey: 'planning', extract: 'Extract', reference: 'Reference' },
      ],
    });

    await service.sweep();

    expect(prisma.categoryReferenceDraft.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: 'pending_review',
        }) as unknown,
      }),
    );
    expect(prisma.referenceQuestion.createMany).not.toHaveBeenCalled();
  });

  // Questions describe the version of the text they arrived with. A new
  // version replaces them wholesale rather than accumulating answers against
  // points that may no longer exist.
  it('clears the previous questions before recording new ones', async () => {
    prisma.resource.findMany.mockResolvedValue([pendingResource]);
    referenceAnalysisClient.pollIngestion.mockResolvedValue({
      status: 'succeeded',
      categories: [
        {
          categoryKey: 'planning',
          extract: 'Extract',
          reference: 'Reference',
          questions: [{ question: 'February or March?', rank: 1 }],
        },
      ],
    });

    await service.sweep();

    expect(prisma.referenceQuestion.deleteMany).toHaveBeenCalledWith({
      where: { draftId: 'draft-1' },
    });
  });

  it('does not abort the sweep when one document fails to poll', async () => {
    prisma.resource.findMany.mockResolvedValue([
      pendingResource,
      { ...pendingResource, id: 'resource-2', anthropicBatchId: 'batch_456' },
    ]);
    referenceAnalysisClient.pollIngestion
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ status: 'pending' });

    await service.sweep();

    expect(referenceAnalysisClient.pollIngestion).toHaveBeenCalledTimes(2);
  });
});
