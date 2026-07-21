import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../test/prisma-mock';
import { ProjectsService } from './projects.service';

const fakeProject = {
  id: 'project-1',
  title: 'My project',
  status: null,
  progressPercentage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ProjectsService', () => {
  let prisma: PrismaMock;
  let service: ProjectsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    service = new ProjectsService(asPrismaService(prisma));
  });

  describe('create', () => {
    it('creates the project and makes the creator a contributor admin', async () => {
      prisma.project.create.mockResolvedValue(fakeProject);
      prisma.projectMember.create.mockResolvedValue({
        id: 'member-1',
        projectId: fakeProject.id,
        userId: 'user-1',
        role: 'contributor',
        isAdmin: true,
        createdAt: new Date(),
      });

      const result = await service.create('user-1', { title: 'My project' });

      expect(prisma.project.create).toHaveBeenCalledWith({
        data: { title: 'My project' },
      });
      expect(prisma.projectMember.create).toHaveBeenCalledWith({
        data: {
          projectId: fakeProject.id,
          userId: 'user-1',
          role: 'contributor',
          isAdmin: true,
        },
      });
      expect(result).toEqual(fakeProject);
    });
  });

  describe('findAllForUser', () => {
    it('lists projects the user is a member of, most recent first', async () => {
      prisma.project.findMany.mockResolvedValue([fakeProject]);

      const result = await service.findAllForUser('user-1');

      expect(prisma.project.findMany).toHaveBeenCalledWith({
        where: { members: { some: { userId: 'user-1' } } },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([fakeProject]);
    });
  });

  describe('findOneForUser', () => {
    it('returns the project when the user is a member', async () => {
      prisma.project.findFirst.mockResolvedValue(fakeProject);

      const result = await service.findOneForUser('user-1', 'project-1');

      expect(prisma.project.findFirst).toHaveBeenCalledWith({
        where: { id: 'project-1', members: { some: { userId: 'user-1' } } },
      });
      expect(result).toEqual(fakeProject);
    });

    it('throws not found when the project does not exist or the user is not a member', async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.findOneForUser('user-1', 'missing-project'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('throws not found when the user has no membership on the project', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.update('user-1', 'project-1', { title: 'New title' }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it('throws forbidden when the member is a client, not a contributor', async () => {
      prisma.projectMember.findUnique.mockResolvedValue({
        id: 'member-1',
        projectId: 'project-1',
        userId: 'user-1',
        role: 'client',
        isAdmin: false,
        createdAt: new Date(),
      });

      await expect(
        service.update('user-1', 'project-1', { title: 'New title' }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.project.update).not.toHaveBeenCalled();
    });

    it('updates the title when the member is a contributor', async () => {
      prisma.projectMember.findUnique.mockResolvedValue({
        id: 'member-1',
        projectId: 'project-1',
        userId: 'user-1',
        role: 'contributor',
        isAdmin: true,
        createdAt: new Date(),
      });
      prisma.project.update.mockResolvedValue({
        ...fakeProject,
        title: 'New title',
      });

      const result = await service.update('user-1', 'project-1', {
        title: 'New title',
      });

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'project-1' },
        data: { title: 'New title' },
      });
      expect(result.title).toBe('New title');
    });
  });
});
