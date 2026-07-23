import type { User } from '@prisma/client';
import { BoardConnectionsController } from './board-connections.controller';
import { BoardConnectionsService } from './board-connections.service';

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
  socials: null,
  roleTitle: null,
  status: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fakeConnection = {
  provider: 'github' as const,
  boardOwnerLogin: 'acme',
  boardOwnerType: 'Organization',
  boardNumber: 3,
  boardTitle: 'Roadmap',
  boardUrl: 'https://github.com/orgs/acme/projects/3',
};

describe('BoardConnectionsController', () => {
  let boardConnectionsService: jest.Mocked<
    Pick<
      BoardConnectionsService,
      'findForProject' | 'preview' | 'connect' | 'disconnect'
    >
  >;
  let controller: BoardConnectionsController;

  beforeEach(() => {
    boardConnectionsService = {
      findForProject: jest.fn(),
      preview: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    controller = new BoardConnectionsController(
      boardConnectionsService as unknown as BoardConnectionsService,
    );
  });

  it('findOne delegates to the service with the current user and project id', async () => {
    boardConnectionsService.findForProject.mockResolvedValue(fakeConnection);

    const result = await controller.findOne(fakeUser, 'project-1');

    expect(boardConnectionsService.findForProject).toHaveBeenCalledWith(
      'user-1',
      'project-1',
    );
    expect(result).toEqual(fakeConnection);
  });

  it('preview delegates to the service with the current user, project id and dto', async () => {
    const boards = [
      {
        ownerLogin: 'acme',
        ownerType: 'Organization' as const,
        number: 3,
        title: 'Roadmap',
        url: 'https://github.com/orgs/acme/projects/3',
      },
    ];
    boardConnectionsService.preview.mockResolvedValue(boards);

    const result = await controller.preview(fakeUser, 'project-1', {
      token: 'a-token',
    });

    expect(boardConnectionsService.preview).toHaveBeenCalledWith(
      'user-1',
      'project-1',
      { token: 'a-token' },
    );
    expect(result).toEqual(boards);
  });

  it('connect delegates to the service with the current user, project id and dto', async () => {
    boardConnectionsService.connect.mockResolvedValue(fakeConnection);
    const dto = {
      token: 'a-token',
      ownerLogin: 'acme',
      ownerType: 'Organization' as const,
      number: 3,
    };

    const result = await controller.connect(fakeUser, 'project-1', dto);

    expect(boardConnectionsService.connect).toHaveBeenCalledWith(
      'user-1',
      'project-1',
      dto,
    );
    expect(result).toEqual(fakeConnection);
  });

  it('disconnect delegates to the service with the current user and project id', async () => {
    boardConnectionsService.disconnect.mockResolvedValue(undefined);

    await controller.disconnect(fakeUser, 'project-1');

    expect(boardConnectionsService.disconnect).toHaveBeenCalledWith(
      'user-1',
      'project-1',
    );
  });
});
