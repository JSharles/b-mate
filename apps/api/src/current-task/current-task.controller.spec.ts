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
  socials: null,
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

  it('findAll delegates to the service with the current user and project id', async () => {
    const items = [{ title: 'Fix bug', description: null, url: null }];
    currentTaskService.getCurrentTask.mockResolvedValue(items);

    const result = await controller.findAll(fakeUser, 'project-1');

    expect(currentTaskService.getCurrentTask).toHaveBeenCalledWith(
      'user-1',
      'project-1',
    );
    expect(result).toEqual(items);
  });
});
