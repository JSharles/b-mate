import { NotFoundException } from '@nestjs/common';
import { ProjectMemberRole } from '@prisma/client';
import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../test/prisma-mock';
import { ProjectAccessService } from './project-access.service';

const contributor = {
  id: 'membership-1',
  projectId: 'project-1',
  userId: 'user-1',
  role: ProjectMemberRole.contributor,
  isAdmin: false,
  createdAt: new Date('2026-08-11T00:00:00.000Z'),
};

describe('ProjectAccessService', () => {
  let prisma: PrismaMock;
  let service: ProjectAccessService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ProjectAccessService(asPrismaService(prisma));
  });

  it('returns contributor membership through the public access boundary', async () => {
    prisma.projectMember.findUnique.mockResolvedValue(contributor);

    await expect(
      service.requireContributor('user-1', 'project-1'),
    ).resolves.toEqual(contributor);
    expect(prisma.projectMember.findUnique).toHaveBeenCalledWith({
      where: {
        projectId_userId: { projectId: 'project-1', userId: 'user-1' },
      },
    });
  });

  it('returns client membership only through the client boundary', async () => {
    const client = { ...contributor, role: ProjectMemberRole.client };
    prisma.projectMember.findUnique.mockResolvedValue(client);

    await expect(service.requireClient('user-1', 'project-1')).resolves.toEqual(
      client,
    );
    await expect(
      service.requireContributor('user-1', 'project-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('uses the identical safe not-found response for missing and unauthorized access', async () => {
    prisma.projectMember.findUnique.mockResolvedValueOnce(null);
    const missing = await service
      .requireContributor('user-1', 'missing-project')
      .catch((error: unknown) => error);

    prisma.projectMember.findUnique.mockResolvedValueOnce({
      ...contributor,
      role: ProjectMemberRole.client,
    });
    const unauthorized = await service
      .requireContributor('user-1', 'project-1')
      .catch((error: unknown) => error);

    expect(missing).toBeInstanceOf(NotFoundException);
    expect(unauthorized).toBeInstanceOf(NotFoundException);
    expect((missing as NotFoundException).getResponse()).toEqual(
      (unauthorized as NotFoundException).getResponse(),
    );
  });

  it('allows any project member without weakening role-specific checks', async () => {
    prisma.projectMember.findUnique.mockResolvedValue(contributor);

    await expect(service.requireMember('user-1', 'project-1')).resolves.toEqual(
      contributor,
    );
  });
});
