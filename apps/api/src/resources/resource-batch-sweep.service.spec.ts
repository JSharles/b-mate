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
    expect(prisma.resourceVulgarization.upsert).not.toHaveBeenCalled();
  });

  it('creates both locale rows and moves the resource to ready_for_review on success', async () => {
    prisma.resource.findMany.mockResolvedValue([processingResource]);
    documentVulgarizationClient.pollBatch.mockResolvedValue({
      status: 'succeeded',
      vulgarizations: [
        { locale: 'en', title: 'Title EN', content: 'Content EN' },
        { locale: 'fr', title: 'Titre FR', content: 'Contenu FR' },
      ],
      categories: [],
    });

    await service.sweep();

    expect(prisma.resourceVulgarization.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.resourceVulgarization.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          resourceId_locale: { resourceId: 'resource-1', locale: 'en' },
        },
        create: expect.objectContaining({
          resourceId: 'resource-1',
          locale: 'en',
          title: 'Title EN',
          content: 'Content EN',
        }) as unknown,
      }),
    );
    expect(prisma.resource.update).toHaveBeenCalledWith({
      where: { id: 'resource-1' },
      data: { status: 'ready_for_review', anthropicBatchId: null },
    });
    expect(prisma.resourceCategory.upsert).not.toHaveBeenCalled();
  });

  it('upserts a ResourceCategory per proposed category and a proposed assignment linking it to the resource', async () => {
    prisma.resource.findMany.mockResolvedValue([processingResource]);
    documentVulgarizationClient.pollBatch.mockResolvedValue({
      status: 'succeeded',
      vulgarizations: [
        { locale: 'en', title: 'Title EN', content: 'Content EN' },
        { locale: 'fr', title: 'Titre FR', content: 'Contenu FR' },
      ],
      categories: [
        {
          key: 'architecture-stack',
          labelEn: 'Architecture & stack',
          labelFr: 'Architecture et stack',
        },
      ],
    });
    prisma.resourceCategory.upsert.mockResolvedValue({
      id: 'category-1',
      projectId: 'project-1',
      key: 'architecture-stack',
      labelEn: 'Architecture & stack',
      labelFr: 'Architecture et stack',
    });

    await service.sweep();

    expect(prisma.resourceCategory.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId_key: { projectId: 'project-1', key: 'architecture-stack' },
        },
        create: {
          projectId: 'project-1',
          key: 'architecture-stack',
          labelEn: 'Architecture & stack',
          labelFr: 'Architecture et stack',
        },
      }),
    );
    expect(prisma.resourceCategoryAssignment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          resourceId_categoryId: {
            resourceId: 'resource-1',
            categoryId: 'category-1',
          },
        },
        create: {
          resourceId: 'resource-1',
          categoryId: 'category-1',
          status: 'proposed',
        },
      }),
    );
  });

  it('sets status: failed with a failureReason when the batch failed, and clears anthropicBatchId', async () => {
    prisma.resource.findMany.mockResolvedValue([processingResource]);
    documentVulgarizationClient.pollBatch.mockResolvedValue({
      status: 'failed',
      reason: 'fr: errored',
    });

    await service.sweep();

    expect(prisma.resource.update).toHaveBeenCalledWith({
      where: { id: 'resource-1' },
      data: {
        status: 'failed',
        failureReason: 'fr: errored',
        anthropicBatchId: null,
      },
    });
    expect(prisma.resourceVulgarization.upsert).not.toHaveBeenCalled();
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
