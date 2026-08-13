import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { SESSION_COOKIE_NAME } from './session-cookie';

// Kept deliberately short: an unknown or malformed value is ignored rather than
// stored, and generation falls back to English (specs/018, FR-025).
const SUPPORTED_LOCALES = ['fr', 'en'];

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

    // Remember which language this person reads the product in, so background
    // work can address them in it. Written only when it changes — a write on
    // every request would be pure waste.
    const header = request.header('X-Interface-Locale');
    const locale = SUPPORTED_LOCALES.includes(header ?? '') ? header : null;
    if (locale && locale !== user.locale) {
      await this.authService.rememberLocale(user.id, locale);
      user.locale = locale;
    }

    request.user = user;
    return true;
  }
}
