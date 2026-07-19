import type { User } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SESSION_COOKIE_NAME } from './session-cookie';

const fakeUser: User = {
  id: 'user-1',
  firstName: 'Jean',
  lastName: 'Charles',
  email: 'jc@example.com',
  passwordHash: 'hashed',
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

function createResponseMock(): jest.Mocked<
  Pick<Response, 'cookie' | 'clearCookie'>
> {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };
}

describe('AuthController', () => {
  let authService: jest.Mocked<
    Pick<AuthService, 'signup' | 'login' | 'logout'>
  >;
  let controller: AuthController;

  beforeEach(() => {
    authService = { signup: jest.fn(), login: jest.fn(), logout: jest.fn() };
    controller = new AuthController(authService as unknown as AuthService);
  });

  it('signup sets the session cookie and returns the user without the password hash', async () => {
    authService.signup.mockResolvedValue({
      user: fakeUser,
      sessionId: 'session-1',
    });
    const res = createResponseMock();

    const result = await controller.signup(
      {
        firstName: 'Jean',
        lastName: 'Charles',
        email: 'jc@example.com',
        password: 'supersecret123',
      },
      res as unknown as Response,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      'session-1',
      expect.any(Object),
    );
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).toMatchObject({ id: 'user-1', email: 'jc@example.com' });
  });

  it('login sets the session cookie and returns the user without the password hash', async () => {
    authService.login.mockResolvedValue({
      user: fakeUser,
      sessionId: 'session-2',
    });
    const res = createResponseMock();

    const result = await controller.login(
      { email: 'jc@example.com', password: 'supersecret123' },
      res as unknown as Response,
    );

    expect(res.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      'session-2',
      expect.any(Object),
    );
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('logout clears the cookie and deletes the session when one is present', async () => {
    const res = createResponseMock();
    const req = {
      cookies: { [SESSION_COOKIE_NAME]: 'session-1' },
    } as unknown as Request;

    const result = await controller.logout(req, res as unknown as Response);

    expect(authService.logout).toHaveBeenCalledWith('session-1');
    expect(res.clearCookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      expect.any(Object),
    );
    expect(result).toEqual({ success: true });
  });

  it('logout is a no-op on the service when there is no cookie, but still clears it client-side', async () => {
    const res = createResponseMock();
    const req = { cookies: {} } as unknown as Request;

    await controller.logout(req, res as unknown as Response);

    expect(authService.logout).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalled();
  });

  it('me returns the current user without the password hash', () => {
    const result = controller.me(fakeUser);

    expect(result).not.toHaveProperty('passwordHash');
    expect(result).toMatchObject({ id: 'user-1', email: 'jc@example.com' });
  });
});
