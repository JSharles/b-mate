import { NotFoundException } from '@nestjs/common';
import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../test/prisma-mock';
import { TaskVulgarizationService } from '../task-vulgarization/task-vulgarization.service';
import { CurrentTaskService } from './current-task.service';

const membership = {
  id: 'member-1',
  projectId: 'project-1',
  userId: 'user-1',
  role: 'client',
  isAdmin: false,
  createdAt: new Date(),
};

const item = {
  title: 'Securing your logins',
  why: 'Some accounts could stay accessible longer than they should.',
  impact: 'Nothing changes in how you use the product.',
  status: 'A first version was built and is being reviewed.',
  updatedAt: '2026-07-20T10:00:00.000Z',
  startedAt: '2026-07-18T10:00:00.000Z',
  estimatedCompletionAt: '2026-07-24T10:00:00.000Z',
  estimateConfidence: 'medium' as const,
};

describe('CurrentTaskService', () => {
  let prisma: PrismaMock;
  let taskVulgarizationService: jest.Mocked<
    Pick<TaskVulgarizationService, 'getVulgarizedCurrentTask'>
  >;
  let service: CurrentTaskService;

  beforeEach(() => {
    prisma = createPrismaMock();
    taskVulgarizationService = { getVulgarizedCurrentTask: jest.fn() };
    service = new CurrentTaskService(
      asPrismaService(prisma),
      taskVulgarizationService as unknown as TaskVulgarizationService,
    );
  });

  it('delegates to TaskVulgarizationService.getVulgarizedCurrentTask with the project id and locale', async () => {
    prisma.projectMember.findUnique.mockResolvedValue(membership);
    taskVulgarizationService.getVulgarizedCurrentTask.mockResolvedValue([item]);

    const result = await service.getCurrentTask('user-1', 'project-1', 'en');

    expect(
      taskVulgarizationService.getVulgarizedCurrentTask,
    ).toHaveBeenCalledWith('project-1', 'en');
    expect(result).toEqual([item]);
  });

  it('throws not found for a non-member of the project', async () => {
    prisma.projectMember.findUnique.mockResolvedValue(null);

    await expect(
      service.getCurrentTask('user-1', 'project-1', 'fr'),
    ).rejects.toThrow(NotFoundException);
    expect(
      taskVulgarizationService.getVulgarizedCurrentTask,
    ).not.toHaveBeenCalled();
  });

  it('allows a contributor to call it too (not client-only at the API level)', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      ...membership,
      role: 'contributor',
      isAdmin: true,
    });
    taskVulgarizationService.getVulgarizedCurrentTask.mockResolvedValue([item]);

    const result = await service.getCurrentTask('user-1', 'project-1', 'fr');

    expect(result).toEqual([item]);
  });
});
