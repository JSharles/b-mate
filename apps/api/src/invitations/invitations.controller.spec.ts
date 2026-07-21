import type { User } from '@prisma/client';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

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

const fakeInvitation = {
  id: 'invitation-1',
  projectId: 'project-1',
  email: 'client@example.com',
  role: 'client',
  isAdmin: true,
  token: 'a-random-token',
  status: 'invited',
  expiresAt: new Date(),
  createdAt: new Date(),
};

describe('InvitationsController', () => {
  let invitationsService: jest.Mocked<
    Pick<InvitationsService, 'create' | 'findAllForProject'>
  >;
  let controller: InvitationsController;

  beforeEach(() => {
    invitationsService = { create: jest.fn(), findAllForProject: jest.fn() };
    controller = new InvitationsController(
      invitationsService as unknown as InvitationsService,
    );
  });

  it('create delegates to the service with the current user, project id and dto', async () => {
    invitationsService.create.mockResolvedValue(fakeInvitation);

    const result = await controller.create(fakeUser, 'project-1', {
      email: 'client@example.com',
    });

    expect(invitationsService.create).toHaveBeenCalledWith(
      'user-1',
      'project-1',
      {
        email: 'client@example.com',
      },
    );
    expect(result).toEqual(fakeInvitation);
  });

  it('findAll delegates to the service with the current user and project id', async () => {
    invitationsService.findAllForProject.mockResolvedValue([fakeInvitation]);

    const result = await controller.findAll(fakeUser, 'project-1');

    expect(invitationsService.findAllForProject).toHaveBeenCalledWith(
      'user-1',
      'project-1',
    );
    expect(result).toEqual([fakeInvitation]);
  });
});
