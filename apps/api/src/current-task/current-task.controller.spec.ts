import type { User } from '@prisma/client';
import { CurrentTaskController } from './current-task.controller';
import { CurrentTaskService } from './current-task.service';

const fakeUser: User = {
  id: 'user-1',
  firstName: 'Jean',
  lastName: 'Charles',
  email: 'jc@example.com',
  passwordHash: 'hashed',
  accountKind: 'client',
  company: null,
  address: null,
  phone: null,
  image: null,
  bio: null,
  github: null,
  githubId: null,
  socials: null,
  linkedin: null,
  malt: null,
  website: null,
  roleTitle: null,
  status: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('CurrentTaskController', () => {
  let currentTaskService: jest.Mocked<
    Pick<CurrentTaskService, 'getCurrentTask'>
  >;
  let controller: CurrentTaskController;

  beforeEach(() => {
    currentTaskService = { getCurrentTask: jest.fn() };
    controller = new CurrentTaskController(
      currentTaskService as unknown as CurrentTaskService,
    );
  });

  it('findAll delegates to the service with the current user, project id, and locale', async () => {
    const items = [
      {
        title: 'Fix bug',
        description: null,
        updatedAt: '2026-07-20T10:00:00.000Z',
        startedAt: '2026-07-18T10:00:00.000Z',
        estimatedCompletionAt: null,
        estimateConfidence: null,
      },
    ];
    currentTaskService.getCurrentTask.mockResolvedValue(items);

    const result = await controller.findAll(fakeUser, 'project-1', 'en');

    expect(currentTaskService.getCurrentTask).toHaveBeenCalledWith(
      'user-1',
      'project-1',
      'en',
    );
    expect(result).toEqual(items);
  });

  it('defaults to the app default locale ("fr") when the query param is missing or invalid', async () => {
    currentTaskService.getCurrentTask.mockResolvedValue([]);

    await controller.findAll(fakeUser, 'project-1', undefined);
    await controller.findAll(fakeUser, 'project-1', 'de');

    expect(currentTaskService.getCurrentTask).toHaveBeenNthCalledWith(
      1,
      'user-1',
      'project-1',
      'fr',
    );
    expect(currentTaskService.getCurrentTask).toHaveBeenNthCalledWith(
      2,
      'user-1',
      'project-1',
      'fr',
    );
  });
});
