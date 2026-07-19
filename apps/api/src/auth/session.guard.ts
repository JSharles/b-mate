import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { SESSION_COOKIE_NAME } from './session-cookie';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const sessionId = request.cookies?.[SESSION_COOKIE_NAME] as
      string | undefined;

    if (!sessionId) {
      throw new UnauthorizedException('Not authenticated');
    }

    const user = await this.authService.validateSession(sessionId);
    if (!user) {
      throw new UnauthorizedException('Session expired or invalid');
    }

    request.user = user;
    return true;
  }
}
