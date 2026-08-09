import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../test/prisma-mock';
import { DocumentVulgarizationClient } from './document-vulgarization.client';
import { ResourceBatchSweepService } from './resource-batch-sweep.service';

const processingResource = {
  id: 'resource-1',
  projectId: 'project-1',
  source: 'upload' as const,
  status: 'processing' as const,
  title: 'Architecture overview',
  anthropicBatchId: 'batch_123',
};

const overviewSection = {
  categoryKey: 'overview' as const,
  titleEn: 'What this project delivers',
  contentEn: 'Content EN',
  titleFr: 'Ce que ce projet livre',
  contentFr: 'Contenu FR',
};

const planningSection = {
  categoryKey: 'planning' as const,
  titleEn: 'Delivery dates',
  contentEn: 'Dates EN',
  titleFr: 'Dates de livraison',
  contentFr: 'Dates FR',
};

describe('ResourceBatchSweepService', () => {
  let prisma: PrismaMock;
  let documentVulgarizationClient: jest.Mocked<
    Pick<DocumentVulgarizationClient, 'pollBatch'>
  >;
  let service: ResourceBatchSweepService;

  beforeEach(() => {
    prisma = createPrismaMock();
    documentVulgarizationClient = { pollBatch: jest.fn() };
    service = new ResourceBatchSweepService(
      asPrismaService(prisma),
      documentVulgarizationClient as unknown as DocumentVulgarizationClient,
    );
  });

  it('finds resources still processing with a batch id and polls each one', async () => {
    prisma.resource.findMany.mockResolvedValue([processingResource]);
    documentVulgarizationClient.pollBatch.mockResolvedValue({
      status: 'pending',
    });

    await service.sweep();

    expect(prisma.resource.findMany).toHaveBeenCalledWith({
      where: { status: 'processing', anthropicBatchId: { not: null } },
    });
    expect(documentVulgarizationClient.pollBatch).toHaveBeenCalledWith(
      'batch_123',
    );
  });

  it('leaves a resource untouched while its batch is still pending', async () => {
    prisma.resource.findMany.mockResolvedValue([processingResource]);
    documentVulgarizationClient.pollBatch.mockResolvedValue({
      status: 'pending',
    });

    await service.sweep();

    expect(prisma.resource.update).not.toHaveBeenCalled();
    expect(prisma.resourceSection.upsert).not.toHaveBeenCalled();
  });

  it('persists one section per returned category and moves the resource to ready_for_review', async () => {
    prisma.resource.findMany.mockResolvedValue([processingResource]);
    documentVulgarizationClient.pollBatch.mockResolvedValue({
      status: 'succeeded',
      sections: [overviewSection, planningSection],
    });

    await service.sweep();

    expect(prisma.resourceSection.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.resourceSection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          resourceId_categoryKey: {
            resourceId: 'resource-1',
            categoryKey: 'overview',
          },
        },
        create: expect.objectContaining({
          resourceId: 'resource-1',
          categoryKey: 'overview',
          titleEn: 'What this project delivers',
          contentEn: 'Content EN',
          titleFr: 'Ce que ce projet livre',
          contentFr: 'Contenu FR',
        }) as unknown,
      }),
    );
    expect(prisma.resource.update).toHaveBeenCalledWith({
      where: { id: 'resource-1' },
      data: { status: 'ready_for_review', anthropicBatchId: null },
    });
  });

  // FR-022: `position` is what orders several of a resource's sections inside
  // one client tab, so it must follow the order the analysis returned them in.
  it('stores each section at its position in the returned order', async () => {
    prisma.resource.findMany.mockResolvedValue([processingResource]);
    documentVulgarizationClient.pollBatch.mockResolvedValue({
      status: 'succeeded',
      sections: [overviewSection, planningSection],
    });

    await service.sweep();

    const positions = prisma.resourceSection.upsert.mock.calls.map(
      ([arg]: [{ create: { categoryKey: string; position: number } }]) => [
        arg.create.categoryKey,
        arg.create.position,
      ],
    );
    expect(positions).toEqual([
      ['overview', 0],
      ['planning', 1],
    ]);
  });

  // A sweep interrupted between the API call and the commit re-polls the same
  // ended batch. The upsert key is what stops that duplicating rows — and the
  // update must not reset `status`, or content a contributor already approved
  // would quietly return to the review queue.
  it('upserts rather than duplicating, without resetting a section review state', async () => {
    prisma.resource.findMany.mockResolvedValue([processingResource]);
    documentVulgarizationClient.pollBatch.mockResolvedValue({
      status: 'succeeded',
      sections: [overviewSection],
    });

    await service.sweep();

    const [arg] = prisma.resourceSection.upsert.mock.calls[0] as [
      { update: Record<string, unknown> },
    ];
    expect(arg.update).not.toHaveProperty('status');
    expect(arg.update).toEqual(
      expect.objectContaining({ titleEn: 'What this project delivers' }),
    );
  });

  it('sets status: failed with a failureReason when the batch failed, and clears anthropicBatchId', async () => {
    prisma.resource.findMany.mockResolvedValue([processingResource]);
    documentVulgarizationClient.pollBatch.mockResolvedValue({
      status: 'failed',
      reason:
        'invalid_request_error: At least one of the image dimensions exceed max allowed size: 8000 pixels',
    });

    await service.sweep();

    expect(prisma.resource.update).toHaveBeenCalledWith({
      where: { id: 'resource-1' },
      data: {
        status: 'failed',
        failureReason:
          'invalid_request_error: At least one of the image dimensions exceed max allowed size: 8000 pixels',
        anthropicBatchId: null,
      },
    });
    expect(prisma.resourceSection.upsert).not.toHaveBeenCalled();
  });

  it('does not abort the sweep when one resource fails to poll', async () => {
    const otherResource = {
      ...processingResource,
      id: 'resource-2',
      anthropicBatchId: 'batch_456',
    };
    prisma.resource.findMany.mockResolvedValue([
      processingResource,
      otherResource,
    ]);
    documentVulgarizationClient.pollBatch
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ status: 'pending' });

    await service.sweep();

    expect(documentVulgarizationClient.pollBatch).toHaveBeenCalledTimes(2);
  });
});
