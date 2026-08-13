import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { User } from '@prisma/client';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';

function createContext(
  cookies: Record<string, string> | undefined,
  locale?: string,
): {
  context: ExecutionContext;
  request: { cookies: Record<string, string> | undefined; user?: User };
} {
  const request: {
    cookies: Record<string, string> | undefined;
    user?: User;
    header: (name: string) => string | undefined;
  } = { cookies, header: () => locale };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('SessionGuard', () => {
  let authService: jest.Mocked<
    Pick<AuthService, 'validateSession' | 'rememberLocale'>
  >;
  let guard: SessionGuard;

  beforeEach(() => {
    authService = { validateSession: jest.fn(), rememberLocale: jest.fn() };
    guard = new SessionGuard(authService as unknown as AuthService);
  });

  it('rejects when there is no session cookie', async () => {
    const { context } = createContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(authService.validateSession).not.toHaveBeenCalled();
  });

  it('rejects when the session is invalid or expired', async () => {
    authService.validateSession.mockResolvedValue(null);
    const { context } = createContext({ session_token: 'bad-session' });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('allows the request through and attaches the user when the session is valid', async () => {
    const user = { id: 'user-1' } as User;
    authService.validateSession.mockResolvedValue(user);
    const { context, request } = createContext({
      session_token: 'good-session',
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toBe(user);
    expect(authService.validateSession).toHaveBeenCalledWith('good-session');
  });

  // The language is learned from the interface rather than configured, so
  // background work can address the developer in it.
  it('remembers the interface language when it changes', async () => {
    const user = { id: 'user-1', locale: 'en' } as User;
    authService.validateSession.mockResolvedValue(user);
    const { context } = createContext({ session_token: 'good' }, 'fr');

    await guard.canActivate(context);

    expect(authService.rememberLocale).toHaveBeenCalledWith('user-1', 'fr');
  });

  // A write on every request would be pure waste.
  it('writes nothing when the language has not changed', async () => {
    const user = { id: 'user-1', locale: 'fr' } as User;
    authService.validateSession.mockResolvedValue(user);
    const { context } = createContext({ session_token: 'good' }, 'fr');

    await guard.canActivate(context);

    expect(authService.rememberLocale).not.toHaveBeenCalled();
  });

  it('ignores a language it does not support', async () => {
    const user = { id: 'user-1', locale: 'fr' } as User;
    authService.validateSession.mockResolvedValue(user);
    const { context } = createContext({ session_token: 'good' }, 'xx');

    await guard.canActivate(context);

    expect(authService.rememberLocale).not.toHaveBeenCalled();
  });
});
