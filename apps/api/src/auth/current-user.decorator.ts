import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { User } from '@prisma/client';

// Exported separately so it can be unit tested directly — createParamDecorator's
// return value isn't a plain callable function, see NestJS's custom decorator
// testing docs.
export function currentUserFactory(_: unknown, ctx: ExecutionContext): User {
  const request = ctx.switchToHttp().getRequest<Request>();
  return request.user!;
}

export const CurrentUser = createParamDecorator(currentUserFactory);
