import type { User } from '@prisma/client';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

const fakeUser: User = {
  id: 'user-1',
  firstName: 'Jean',
  lastName: 'Charles',
  email: 'jc@example.com',
  passwordHash: 'hashed',
  company: null,
  address: null,
  phone: null,
  image: null,
  bio: null,
  github: null,
  socials: null,
  roleTitle: null,
  status: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fakeProject = {
  id: 'project-1',
  title: 'My project',
  status: null,
  progressPercentage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ProjectsController', () => {
  let projectsService: jest.Mocked<
    Pick<
      ProjectsService,
      | 'create'
      | 'findAllForUser'
      | 'findOneForUser'
      | 'update'
      | 'findMembersForProject'
      | 'removeMember'
    >
  >;
  let controller: ProjectsController;

  beforeEach(() => {
    projectsService = {
      create: jest.fn(),
      findAllForUser: jest.fn(),
      findOneForUser: jest.fn(),
      update: jest.fn(),
      findMembersForProject: jest.fn(),
      removeMember: jest.fn(),
    };
    controller = new ProjectsController(
      projectsService as unknown as ProjectsService,
    );
  });

  it('create delegates to the service with the current user', async () => {
    projectsService.create.mockResolvedValue(fakeProject);

    const result = await controller.create(fakeUser, { title: 'My project' });

    expect(projectsService.create).toHaveBeenCalledWith('user-1', {
      title: 'My project',
    });
    expect(result).toEqual(fakeProject);
  });

  it('findAll delegates to the service with the current user', async () => {
    projectsService.findAllForUser.mockResolvedValue([fakeProject]);

    const result = await controller.findAll(fakeUser);

    expect(projectsService.findAllForUser).toHaveBeenCalledWith('user-1');
    expect(result).toEqual([fakeProject]);
  });

  it('findOne delegates to the service with the current user and project id', async () => {
    projectsService.findOneForUser.mockResolvedValue(fakeProject);

    const result = await controller.findOne(fakeUser, 'project-1');

    expect(projectsService.findOneForUser).toHaveBeenCalledWith(
      'user-1',
      'project-1',
    );
    expect(result).toEqual(fakeProject);
  });

  it('update delegates to the service with the current user, project id and dto', async () => {
    projectsService.update.mockResolvedValue({
      ...fakeProject,
      title: 'New title',
    });

    const result = await controller.update(fakeUser, 'project-1', {
      title: 'New title',
    });

    expect(projectsService.update).toHaveBeenCalledWith('user-1', 'project-1', {
      title: 'New title',
    });
    expect(result.title).toBe('New title');
  });

  it('findMembers delegates to the service with the current user and project id', async () => {
    const members = [
      {
        userId: 'user-2',
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        isAdmin: false,
      },
    ];
    projectsService.findMembersForProject.mockResolvedValue(members);

    const result = await controller.findMembers(fakeUser, 'project-1');

    expect(projectsService.findMembersForProject).toHaveBeenCalledWith(
      'user-1',
      'project-1',
    );
    expect(result).toEqual(members);
  });

  it('removeMember delegates to the service with the current user, project id and target user id', async () => {
    projectsService.removeMember.mockResolvedValue(undefined);

    await controller.removeMember(fakeUser, 'project-1', 'user-2');

    expect(projectsService.removeMember).toHaveBeenCalledWith(
      'user-1',
      'project-1',
      'user-2',
    );
  });
});
