import { NotFoundException } from '@nestjs/common';
import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../test/prisma-mock';
import { encryptToken } from '../board-connections/token-encryption';
import { GithubProjectsClient } from '../board-connections/github-projects.client';
import { CurrentTaskService } from './current-task.service';

const ORIGINAL_ENV = process.env.BOARD_CONNECTION_ENCRYPTION_KEY;

const membership = {
  id: 'member-1',
  projectId: 'project-1',
  userId: 'user-1',
  role: 'client',
  isAdmin: false,
  createdAt: new Date(),
};

const item = {
  title: 'Fix race condition',
  description: 'Details',
  url: 'https://github.com/acme/repo/issues/1',
};

describe('CurrentTaskService', () => {
  let prisma: PrismaMock;
  let githubClient: jest.Mocked<
    Pick<GithubProjectsClient, 'fetchInProgressItems'>
  >;
  let service: CurrentTaskService;
  let storedConnection: {
    id: string;
    projectId: string;
    provider: 'github';
    boardOwnerLogin: string;
    boardOwnerType: string;
    boardNumber: number;
    boardTitle: string;
    boardUrl: string;
    encryptedToken: string;
    createdAt: Date;
    updatedAt: Date;
  };

  beforeEach(() => {
    process.env.BOARD_CONNECTION_ENCRYPTION_KEY =
      '0000000000000000000000000000000000000000000000000000000000000000';
    prisma = createPrismaMock();
    githubClient = { fetchInProgressItems: jest.fn() };
    service = new CurrentTaskService(
      asPrismaService(prisma),
      githubClient as unknown as GithubProjectsClient,
    );
    storedConnection = {
      id: 'connection-1',
      projectId: 'project-1',
      provider: 'github',
      boardOwnerLogin: 'acme',
      boardOwnerType: 'Organization',
      boardNumber: 3,
      boardTitle: 'Roadmap',
      boardUrl: 'https://github.com/orgs/acme/projects/3',
      encryptedToken: encryptToken('a-real-token'),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  afterAll(() => {
    process.env.BOARD_CONNECTION_ENCRYPTION_KEY = ORIGINAL_ENV;
  });

  it('returns the mapped items when a connection exists and GitHub succeeds', async () => {
    prisma.projectMember.findUnique.mockResolvedValue(membership);
    prisma.boardConnection.findUnique.mockResolvedValue(storedConnection);
    githubClient.fetchInProgressItems.mockResolvedValue([item]);

    const result = await service.getCurrentTask('user-1', 'project-1');

    expect(githubClient.fetchInProgressItems).toHaveBeenCalledWith(
      'a-real-token',
      'acme',
      'Organization',
      3,
    );
    expect(result).toEqual([item]);
  });

  it('returns an empty list when no board connection exists', async () => {
    prisma.projectMember.findUnique.mockResolvedValue(membership);
    prisma.boardConnection.findUnique.mockResolvedValue(null);

    const result = await service.getCurrentTask('user-1', 'project-1');

    expect(result).toEqual([]);
    expect(githubClient.fetchInProgressItems).not.toHaveBeenCalled();
  });

  it('returns an empty list, not a thrown error, when the GitHub call fails', async () => {
    prisma.projectMember.findUnique.mockResolvedValue(membership);
    prisma.boardConnection.findUnique.mockResolvedValue(storedConnection);
    githubClient.fetchInProgressItems.mockRejectedValue(
      new Error('GitHub is down'),
    );

    const result = await service.getCurrentTask('user-1', 'project-1');

    expect(result).toEqual([]);
  });

  it('throws not found for a non-member of the project', async () => {
    prisma.projectMember.findUnique.mockResolvedValue(null);

    await expect(service.getCurrentTask('user-1', 'project-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.boardConnection.findUnique).not.toHaveBeenCalled();
  });

  it('allows a contributor to call it too (not client-only at the API level)', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({
      ...membership,
      role: 'contributor',
      isAdmin: true,
    });
    prisma.boardConnection.findUnique.mockResolvedValue(storedConnection);
    githubClient.fetchInProgressItems.mockResolvedValue([item]);

    const result = await service.getCurrentTask('user-1', 'project-1');

    expect(result).toEqual([item]);
  });
});
