import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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

const adminMembership = {
  id: 'member-1',
  projectId: 'project-1',
  userId: 'user-1',
  role: 'contributor',
  isAdmin: true,
  createdAt: new Date(),
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
    it('returns the project plus the caller’s own role and admin status', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(adminMembership);
      prisma.project.findUniqueOrThrow.mockResolvedValue(fakeProject);

      const result = await service.findOneForUser('user-1', 'project-1');

      expect(prisma.project.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'project-1' },
      });
      expect(result).toEqual({
        ...fakeProject,
        role: 'contributor',
        isAdmin: true,
      });
    });

    it('reflects a non-admin client’s own role/admin status', async () => {
      prisma.projectMember.findUnique.mockResolvedValue({
        ...adminMembership,
        role: 'client',
        isAdmin: false,
      });
      prisma.project.findUniqueOrThrow.mockResolvedValue(fakeProject);

      const result = await service.findOneForUser('user-1', 'project-1');

      expect(result.role).toBe('client');
      expect(result.isAdmin).toBe(false);
    });

    it('throws not found when the project does not exist or the user is not a member', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.findOneForUser('user-1', 'missing-project'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.project.findUniqueOrThrow).not.toHaveBeenCalled();
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

  describe('findMembersForProject', () => {
    it('lists members with their user details when the requester is an admin', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(adminMembership);
      prisma.projectMember.findMany.mockResolvedValue([
        {
          ...adminMembership,
          user: {
            id: 'user-1',
            firstName: 'Jean',
            lastName: 'Charles',
            email: 'jc@example.com',
          },
        },
      ]);

      const result = await service.findMembersForProject('user-1', 'project-1');

      expect(prisma.projectMember.findMany).toHaveBeenCalledWith({
        where: { projectId: 'project-1' },
        include: { user: true },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual([
        {
          userId: 'user-1',
          firstName: 'Jean',
          lastName: 'Charles',
          email: 'jc@example.com',
          isAdmin: true,
        },
      ]);
    });

    it('lists members for a non-admin member too (read access only requires membership)', async () => {
      prisma.projectMember.findUnique.mockResolvedValue({
        ...adminMembership,
        isAdmin: false,
      });
      prisma.projectMember.findMany.mockResolvedValue([
        {
          ...adminMembership,
          user: {
            id: 'user-1',
            firstName: 'Jean',
            lastName: 'Charles',
            email: 'jc@example.com',
          },
        },
      ]);

      const result = await service.findMembersForProject('user-1', 'project-1');

      expect(result).toHaveLength(1);
    });

    it('throws not found when the requester is not a member at all', async () => {
      prisma.projectMember.findUnique.mockResolvedValue(null);

      await expect(
        service.findMembersForProject('user-1', 'project-1'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.projectMember.findMany).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('removes a client member', async () => {
      prisma.projectMember.findUnique
        .mockResolvedValueOnce(adminMembership) // assertIsAdmin(requester)
        .mockResolvedValueOnce({
          id: 'member-2',
          projectId: 'project-1',
          userId: 'user-2',
          role: 'client',
          isAdmin: false,
          createdAt: new Date(),
        }); // target

      await service.removeMember('user-1', 'project-1', 'user-2');

      expect(prisma.projectMember.delete).toHaveBeenCalledWith({
        where: {
          projectId_userId: { projectId: 'project-1', userId: 'user-2' },
        },
      });
    });

    it('removes an admin member when another admin remains', async () => {
      prisma.projectMember.findUnique
        .mockResolvedValueOnce(adminMembership) // assertIsAdmin(requester)
        .mockResolvedValueOnce({
          id: 'member-2',
          projectId: 'project-1',
          userId: 'user-2',
          role: 'contributor',
          isAdmin: true,
          createdAt: new Date(),
        }); // target, also an admin
      prisma.projectMember.findMany.mockResolvedValue([
        { ...adminMembership, userId: 'user-1' },
        {
          id: 'member-2',
          projectId: 'project-1',
          userId: 'user-2',
          isAdmin: true,
        },
      ]);

      await service.removeMember('user-1', 'project-1', 'user-2');

      expect(prisma.projectMember.delete).toHaveBeenCalledWith({
        where: {
          projectId_userId: { projectId: 'project-1', userId: 'user-2' },
        },
      });
    });

    it('throws forbidden when the requester is not an admin', async () => {
      prisma.projectMember.findUnique.mockResolvedValue({
        ...adminMembership,
        isAdmin: false,
      });

      await expect(
        service.removeMember('user-1', 'project-1', 'user-2'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.projectMember.delete).not.toHaveBeenCalled();
    });

    it('throws not found when the target is not a member', async () => {
      prisma.projectMember.findUnique
        .mockResolvedValueOnce(adminMembership)
        .mockResolvedValueOnce(null);

      await expect(
        service.removeMember('user-1', 'project-1', 'user-2'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws conflict when removing the project’s only admin (FR-020)', async () => {
      prisma.projectMember.findUnique
        .mockResolvedValueOnce(adminMembership) // assertIsAdmin(requester === target)
        .mockResolvedValueOnce(adminMembership); // target is the requester, sole admin
      prisma.projectMember.findMany.mockResolvedValue([adminMembership]);

      await expect(
        service.removeMember('user-1', 'project-1', 'user-1'),
      ).rejects.toThrow(ConflictException);
      expect(prisma.projectMember.delete).not.toHaveBeenCalled();
    });
  });
});
