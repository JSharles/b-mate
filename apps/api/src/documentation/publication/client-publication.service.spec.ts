import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { GenerationService } from '../../generation/generation.service';
import { ClientPublicationService } from './client-publication.service';
describe('ClientPublicationService', () => {
  function setup() {
    const prisma = createPrismaMock();
    const generation = {
      createInTransaction: jest.fn().mockResolvedValue({ id: 'operation' }),
    };
    return {
      prisma,
      generation,
      service: new ClientPublicationService(
        asPrismaService(prisma),
        generation as unknown as GenerationService,
      ),
    };
  }
  const reference = {
    id: 'reference',
    projectId: 'project',
    categoryKey: 'overview',
    sourceRevisionId: 'revision',
    structuredContent: [],
  };
  it('creates a default profile, rebased category release, and derivation operation', async () => {
    const { prisma, generation, service } = setup();
    prisma.projectEditorialSettings.upsert.mockResolvedValue({
      projectId: 'project',
      currentProfileRevisionId: null,
      nextSequence: 1,
    });
    prisma.editorialProfileRevision.create.mockResolvedValue({ id: 'profile' });
    prisma.projectClientPublication.upsert.mockResolvedValue({
      projectId: 'project',
      currentReleaseId: 'base',
      nextSequence: 2,
    });
    prisma.clientContentReleaseEntry.findMany.mockResolvedValue([
      { categoryKey: 'planning', locale: 'fr', clientCategoryContentId: 'old' },
      {
        categoryKey: 'overview',
        locale: 'fr',
        clientCategoryContentId: 'replace',
      },
    ]);
    prisma.clientContentRelease.create.mockResolvedValue({ id: 'release' });
    await expect(
      service.queueAcceptedReference(reference as never, 'user'),
    ).resolves.toBe('release');
    expect(prisma.editorialProfileRevision.create).toHaveBeenCalled();
    expect(prisma.clientContentRelease.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ expectedCategoryCount: 2 }),
      }),
    );
    expect(generation.createInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'client_derivation' }),
    );
  });
  it('queues all current categories for an atomic editorial release, or no release when nothing is published', async () => {
    const { prisma, generation, service } = setup();
    prisma.projectClientPublication.findUnique.mockResolvedValueOnce(null);
    await expect(
      service.queueEditorialProfile({
        id: 'profile',
        projectId: 'project',
      } as never),
    ).resolves.toBeNull();
    prisma.projectClientPublication.findUnique.mockResolvedValue({
      currentReleaseId: 'base',
      nextSequence: 3,
      currentRelease: {
        entries: [
          {
            categoryKey: 'overview',
            locale: 'fr',
            clientCategoryContent: { categoryReferenceId: 'reference' },
          },
          {
            categoryKey: 'planning',
            locale: 'fr',
            clientCategoryContent: {
              categoryReferenceId: 'planning-reference',
            },
          },
        ],
      },
    });
    prisma.clientContentRelease.create.mockResolvedValue({ id: 'release' });
    await expect(
      service.queueEditorialProfile({
        id: 'profile',
        projectId: 'project',
      } as never),
    ).resolves.toBe('release');
    expect(generation.createInTransaction).toHaveBeenCalledTimes(2);
  });
  it('serializes only published public blocks and exposes pending progress separately', async () => {
    const { prisma, service } = setup();
    prisma.projectClientPublication.findUnique.mockResolvedValue({
      currentRelease: {
        id: 'release',
        sequence: 2,
        status: 'published',
        expectedCategoryCount: 2,
        publishedAt: new Date('2026-01-01'),
        entries: [
          {
            categoryKey: 'overview',
            clientCategoryContent: {
              structuredContent: [{ text: 'Hello' }, { ignored: true }],
            },
          },
        ],
      },
    });
    await expect(service.readPublicCategories('project')).resolves.toEqual([
      {
        categoryKey: 'overview',
        blocks: [{ text: 'Hello' }, { ignored: true }],
      },
    ]);
    prisma.clientContentRelease.findFirst.mockResolvedValue({
      id: 'pending',
      sequence: 3,
      status: 'preparing',
      expectedCategoryCount: 2,
      entries: [
        {
          categoryKey: 'planning',
          clientCategoryContent: { structuredContent: [] },
        },
      ],
    });
    await expect(service.readPreview('project')).resolves.toMatchObject({
      current: { releaseId: 'release', visibleToClient: true },
      pending: {
        releaseId: 'pending',
        visibleToClient: false,
        readyCategoryCount: 1,
      },
    });
  });
  it('returns an empty, non-visible release view before first publication', async () => {
    const { prisma, service } = setup();
    prisma.projectClientPublication.findUnique.mockResolvedValue(null);
    await expect(service.readCurrent('project')).resolves.toMatchObject({
      releaseId: null,
      visibleToClient: false,
      categories: [],
    });
  });
  // A release that loses the swap for the head is dropped, and its category
  // goes with it: accepted by the contributor, never seen by the client.
  it('re-publishes a category whose release was dropped before going live', async () => {
    const { prisma, service } = setup();
    prisma.clientContentRelease.findMany.mockResolvedValue([
      {
        id: 'dropped',
        projectId: 'project',
        initiatingReference: {
          ...reference,
          categoryKey: 'planning',
          acceptedByUserId: 'user',
        },
      },
    ] as never);
    prisma.projectClientPublication.findUnique.mockResolvedValue({
      currentRelease: { entries: [{ categoryKey: 'overview' }] },
    });
    const queue = jest
      .spyOn(service, 'queueAcceptedReference')
      .mockResolvedValue('release');

    await service.recoverDroppedAcceptances();

    expect(queue).toHaveBeenCalledWith(
      expect.objectContaining({ categoryKey: 'planning' }),
      'user',
    );
  });

  it('leaves a category the client already has alone', async () => {
    const { prisma, service } = setup();
    prisma.clientContentRelease.findMany.mockResolvedValue([
      {
        id: 'dropped',
        projectId: 'project',
        initiatingReference: {
          ...reference,
          categoryKey: 'overview',
          acceptedByUserId: 'user',
        },
      },
    ] as never);
    prisma.projectClientPublication.findUnique.mockResolvedValue({
      currentRelease: { entries: [{ categoryKey: 'overview' }] },
    });
    const queue = jest
      .spyOn(service, 'queueAcceptedReference')
      .mockResolvedValue('release');

    await service.recoverDroppedAcceptances();

    expect(queue).not.toHaveBeenCalled();
  });
  // A release still being assembled is a publication attempt. Without this the
  // sweep queued another every thirty seconds — thirteen releases and twelve
  // generation calls — because the category could not appear until the attempt
  // already running had finished.
  it('waits for an attempt in flight instead of starting another', async () => {
    const { prisma, service } = setup();
    prisma.clientContentRelease.findMany.mockResolvedValue([
      {
        id: 'dropped',
        projectId: 'project',
        initiatingReference: {
          ...reference,
          categoryKey: 'planning',
          acceptedByUserId: 'user',
        },
      },
    ] as never);
    prisma.clientContentRelease.count.mockResolvedValue(1);
    const queue = jest
      .spyOn(service, 'queueAcceptedReference')
      .mockResolvedValue('release');

    await service.recoverDroppedAcceptances();

    expect(queue).not.toHaveBeenCalled();
  });
});
