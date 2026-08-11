import { NotFoundException } from '@nestjs/common';
import { GenerationService } from '../../generation/generation.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { asPrismaService, createPrismaMock } from '../../test/prisma-mock';
import { DocumentationOperationsController } from './documentation-operations.controller';

describe('DocumentationOperationsController', () => {
  function setup() {
    const prisma = createPrismaMock();
    const access = { requireContributor: jest.fn() };
    const generation = { retry: jest.fn() };
    return {
      prisma,
      access,
      generation,
      controller: new DocumentationOperationsController(
        asPrismaService(prisma),
        access as unknown as ProjectAccessService,
        generation as unknown as GenerationService,
      ),
    };
  }

  it('queues a replacement only for a contributor-owned attention operation', async () => {
    const { prisma, access, generation, controller } = setup();
    prisma.generationOperation.findFirst.mockResolvedValue({
      id: 'operation-1',
    });
    generation.retry.mockResolvedValue({ id: 'operation-2', status: 'queued' });

    await expect(
      controller.retry({ id: 'user-1' } as never, 'project-1', 'operation-1'),
    ).resolves.toEqual({
      operationId: 'operation-2',
      status: 'queued',
      actionCode: 'RETRY_QUEUED',
    });
    expect(access.requireContributor).toHaveBeenCalledWith(
      'user-1',
      'project-1',
    );
    expect(prisma.generationOperation.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'operation-1',
        projectId: 'project-1',
        status: 'needs_attention',
      },
      select: { id: true },
    });
  });

  it.each([
    ['missing operation', null, undefined],
    ['non-retryable operation', { id: 'operation-1' }, null],
  ])('hides a %s', async (_label, operation, replacement) => {
    const { prisma, generation, controller } = setup();
    prisma.generationOperation.findFirst.mockResolvedValue(operation);
    generation.retry.mockResolvedValue(replacement);
    await expect(
      controller.retry({ id: 'user-1' } as never, 'project-1', 'operation-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
