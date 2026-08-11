import { ClarificationsController } from './clarifications.controller';
import { ClarificationService } from '../source/clarification.service';

describe('ClarificationsController', () => {
  it('forwards ranked reads and batch resolutions with the authenticated contributor', async () => {
    const service = {
      list: jest.fn().mockResolvedValue({ items: [] }),
      resolve: jest.fn().mockResolvedValue({ items: [] }),
    };
    const controller = new ClarificationsController(
      service as unknown as ClarificationService,
    );
    const user = { id: 'user-1' } as never;

    await controller.list(user, 'project-1', 'open', 'planning', 'cursor');
    expect(service.list).toHaveBeenCalledWith('user-1', 'project-1', {
      status: 'open',
      categoryKey: 'planning',
      cursor: 'cursor',
    });

    const body = {
      expectedSourceRevisionId: 'revision-1',
      resolutions: [],
    } as never;
    await controller.resolve(user, 'project-1', body);
    expect(service.resolve).toHaveBeenCalledWith('user-1', 'project-1', body);
  });
});
