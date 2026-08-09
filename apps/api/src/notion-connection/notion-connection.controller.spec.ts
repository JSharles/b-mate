import type { User } from '@prisma/client';
import { NotionConnectionController } from './notion-connection.controller';
import { NotionConnectionService } from './notion-connection.service';

const fakeUser: User = {
  id: 'user-1',
  firstName: 'Jean',
  lastName: 'Charles',
  email: 'jc@example.com',
  passwordHash: 'hashed',
  accountKind: 'developer',
  company: null,
  address: null,
  phone: null,
  image: null,
  bio: null,
  github: null,
  githubId: null,
  socials: null,
  linkedin: null,
  malt: null,
  website: null,
  roleTitle: null,
  status: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('NotionConnectionController', () => {
  let notionConnectionService: jest.Mocked<
    Pick<NotionConnectionService, 'findForProject' | 'connect' | 'disconnect'>
  >;
  let controller: NotionConnectionController;

  beforeEach(() => {
    notionConnectionService = {
      findForProject: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    controller = new NotionConnectionController(
      notionConnectionService as unknown as NotionConnectionService,
    );
  });

  describe('findOne', () => {
    it('delegates to the service with the current user and project id', async () => {
      notionConnectionService.findForProject.mockResolvedValue({
        connected: true,
        workspaceName: 'Acme Workspace',
      });

      const result = await controller.findOne(fakeUser, 'project-1');

      expect(notionConnectionService.findForProject).toHaveBeenCalledWith(
        'user-1',
        'project-1',
      );
      expect(result).toEqual({
        connected: true,
        workspaceName: 'Acme Workspace',
      });
    });
  });

  describe('connect', () => {
    it('delegates to the service with the current user, project id, and token', async () => {
      notionConnectionService.connect.mockResolvedValue({
        connected: true,
        workspaceName: 'Acme Workspace',
      });

      const result = await controller.connect(fakeUser, 'project-1', {
        token: 'secret-token',
      });

      expect(notionConnectionService.connect).toHaveBeenCalledWith(
        'user-1',
        'project-1',
        'secret-token',
      );
      expect(result).toEqual({
        connected: true,
        workspaceName: 'Acme Workspace',
      });
    });

    it('propagates a rejection from the service (invalid token) rather than swallowing it', async () => {
      notionConnectionService.connect.mockRejectedValue(
        new Error('Unable to access this Notion page'),
      );

      await expect(
        controller.connect(fakeUser, 'project-1', { token: 'bad-token' }),
      ).rejects.toThrow('Unable to access this Notion page');
    });
  });

  describe('disconnect', () => {
    it('delegates to the service with the current user and project id', async () => {
      notionConnectionService.disconnect.mockResolvedValue(undefined);

      await controller.disconnect(fakeUser, 'project-1');

      expect(notionConnectionService.disconnect).toHaveBeenCalledWith(
        'user-1',
        'project-1',
      );
    });
  });
});
