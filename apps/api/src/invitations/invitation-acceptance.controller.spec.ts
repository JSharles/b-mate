import type { User } from '@prisma/client';
import type { Response } from 'express';
import { InvitationAcceptanceController } from './invitation-acceptance.controller';
import { InvitationsService } from './invitations.service';
import { SESSION_COOKIE_NAME } from '../auth/session-cookie';

const fakeUser: User = {
  id: 'user-1',
  firstName: 'Jean',
  lastName: 'Charles',
  email: 'client@example.com',
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

const fakeInvitationDetails = {
  email: 'client@example.com',
  projectTitle: 'Site vitrine client X',
  accountExists: false,
  status: 'invited' as const,
};

function createResponseMock(): jest.Mocked<Pick<Response, 'cookie'>> {
  return { cookie: jest.fn() };
}

describe('InvitationAcceptanceController', () => {
  let invitationsService: jest.Mocked<
    Pick<InvitationsService, 'getByToken' | 'accept'>
  >;
  let controller: InvitationAcceptanceController;

  beforeEach(() => {
    invitationsService = { getByToken: jest.fn(), accept: jest.fn() };
    controller = new InvitationAcceptanceController(
      invitationsService as unknown as InvitationsService,
    );
  });

  it('getByToken delegates to the service', async () => {
    invitationsService.getByToken.mockResolvedValue(fakeInvitationDetails);

    const result = await controller.getByToken('a-random-token');

    expect(invitationsService.getByToken).toHaveBeenCalledWith(
      'a-random-token',
    );
    expect(result).toEqual(fakeInvitationDetails);
  });

  it('accept sets the session cookie and returns the user without the password hash', async () => {
    invitationsService.accept.mockResolvedValue({
      user: fakeUser,
      sessionId: 'session-1',
    });
    const res = createResponseMock();

    const result = await controller.accept(
      'a-random-token',
      { password: 'supersecret123' },
      res as unknown as Response,
    );

    expect(invitationsService.accept).toHaveBeenCalledWith('a-random-token', {
      password: 'supersecret123',
    });
    expect(res.cookie).toHaveBeenCalledWith(
      SESSION_COOKIE_NAME,
      'session-1',
      expect.any(Object),
    );
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).toMatchObject({ id: 'user-1', email: 'client@example.com' });
  });
});
