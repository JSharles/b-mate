import { ExecutionContext } from '@nestjs/common';
import { User } from '@prisma/client';
import { currentUserFactory } from './current-user.decorator';

describe('currentUserFactory', () => {
  it('extracts request.user from the execution context', () => {
    const user = { id: 'user-1' } as User;
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;

    expect(currentUserFactory(undefined, context)).toBe(user);
  });
});
