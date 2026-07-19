import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { User } from '@prisma/client';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';

function createContext(cookies: Record<string, string> | undefined): {
  context: ExecutionContext;
  request: { cookies: Record<string, string> | undefined; user?: User };
} {
  const request: { cookies: Record<string, string> | undefined; user?: User } =
    { cookies };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('SessionGuard', () => {
  let authService: jest.Mocked<Pick<AuthService, 'validateSession'>>;
  let guard: SessionGuard;

  beforeEach(() => {
    authService = { validateSession: jest.fn() };
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
});
