import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../test/prisma-mock';
import { GithubProjectsClient } from '../board-connections/github-projects.client';
import { encryptToken } from '../board-connections/token-encryption';
import { AnthropicVulgarizationClient } from './anthropic-vulgarization.client';
import { TaskVulgarizationService } from './task-vulgarization.service';

const ORIGINAL_ENV = process.env.BOARD_CONNECTION_ENCRYPTION_KEY;
// Set before encryptToken() runs below (module-scope, ahead of beforeEach).
process.env.BOARD_CONNECTION_ENCRYPTION_KEY =
  '0000000000000000000000000000000000000000000000000000000000000000';

const connection = {
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

const project = {
  id: 'project-1',
  title: 'Client website',
  status: null,
  progressPercentage: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const item = {
  id: 'PVTI_item1',
  title: 'Refactor auth middleware',
  description: 'Rework the session validation layer.',
};

const vulgarizedRow = {
  id: 'row-1',
  projectId: 'project-1',
  githubItemId: 'PVTI_item1',
  locale: 'en',
  originalTitle: item.title,
  originalDescription: item.description,
  vulgarizedTitle: 'Securing your logins',
  vulgarizedDescription: 'We made sign-in safer for everyone.',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('TaskVulgarizationService', () => {
  let prisma: PrismaMock;
  let githubClient: jest.Mocked<
    Pick<GithubProjectsClient, 'fetchInProgressItems'>
  >;
  let anthropicClient: jest.Mocked<
    Pick<AnthropicVulgarizationClient, 'vulgarize'>
  >;
  let service: TaskVulgarizationService;

  beforeEach(() => {
    process.env.BOARD_CONNECTION_ENCRYPTION_KEY =
      '0000000000000000000000000000000000000000000000000000000000000000';
    prisma = createPrismaMock();
    githubClient = { fetchInProgressItems: jest.fn() };
    anthropicClient = { vulgarize: jest.fn() };
    service = new TaskVulgarizationService(
      asPrismaService(prisma),
      githubClient as unknown as GithubProjectsClient,
      anthropicClient as unknown as AnthropicVulgarizationClient,
    );
  });

  afterAll(() => {
    process.env.BOARD_CONNECTION_ENCRYPTION_KEY = ORIGINAL_ENV;
  });

  describe('sweep', () => {
    it('vulgarizes a new item once per supported locale and stores original + vulgarized together', async () => {
      prisma.boardConnection.findMany.mockResolvedValue([connection]);
      githubClient.fetchInProgressItems.mockResolvedValue([item]);
      prisma.vulgarizedTask.findUnique.mockResolvedValue(null);
      prisma.project.findUniqueOrThrow.mockResolvedValue(project);
      anthropicClient.vulgarize.mockResolvedValue({
        title: 'Securing your logins',
        description: 'We made sign-in safer for everyone.',
      });

      await service.sweep();

      expect(anthropicClient.vulgarize).toHaveBeenCalledTimes(2); // en + fr
      expect(prisma.vulgarizedTask.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.vulgarizedTask.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            projectId: 'project-1',
            githubItemId: 'PVTI_item1',
            originalTitle: item.title,
            originalDescription: item.description,
            vulgarizedTitle: 'Securing your logins',
            vulgarizedDescription: 'We made sign-in safer for everyone.',
          }) as unknown,
        }),
      );
    });

    it('skips the Anthropic call when the fetched content matches the stored original (FR-004)', async () => {
      prisma.boardConnection.findMany.mockResolvedValue([connection]);
      githubClient.fetchInProgressItems.mockResolvedValue([item]);
      prisma.vulgarizedTask.findUnique.mockResolvedValue(vulgarizedRow);

      await service.sweep();

      expect(anthropicClient.vulgarize).not.toHaveBeenCalled();
      expect(prisma.vulgarizedTask.upsert).not.toHaveBeenCalled();
    });

    it('leaves the row untouched when vulgarization fails, so the next sweep retries (FR-007, research.md Decision 4)', async () => {
      prisma.boardConnection.findMany.mockResolvedValue([connection]);
      githubClient.fetchInProgressItems.mockResolvedValue([item]);
      prisma.vulgarizedTask.findUnique.mockResolvedValue(null);
      prisma.project.findUniqueOrThrow.mockResolvedValue(project);
      anthropicClient.vulgarize.mockRejectedValue(new Error('LLM timeout'));

      await service.sweep();

      expect(prisma.vulgarizedTask.upsert).not.toHaveBeenCalled();
    });

    // US2 (spec.md): an edit on GitHub must replace the previous vulgarized
    // version, not sit alongside it as a second row, and must produce
    // exactly one fresh Anthropic call per locale — distinct from the
    // "skip when unchanged" assertion above.
    it('replaces both original and vulgarized content when the GitHub item has changed since the last sweep', async () => {
      const changedItem = {
        ...item,
        title: 'Refactor auth middleware (v2)',
        description:
          'Rework the session validation layer, now with refresh tokens.',
      };
      prisma.boardConnection.findMany.mockResolvedValue([connection]);
      githubClient.fetchInProgressItems.mockResolvedValue([changedItem]);
      prisma.vulgarizedTask.findUnique.mockResolvedValue(vulgarizedRow); // stale baseline
      prisma.project.findUniqueOrThrow.mockResolvedValue(project);
      anthropicClient.vulgarize.mockResolvedValue({
        title: 'Securing your logins, now with auto-renewal',
        description: 'We made sign-in safer and more convenient.',
      });

      await service.sweep();

      expect(anthropicClient.vulgarize).toHaveBeenCalledTimes(2); // en + fr
      expect(prisma.vulgarizedTask.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.vulgarizedTask.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            projectId_githubItemId_locale: {
              projectId: 'project-1',
              githubItemId: 'PVTI_item1',
              locale: 'en',
            },
          },
          update: expect.objectContaining({
            originalTitle: changedItem.title,
            originalDescription: changedItem.description,
            vulgarizedTitle: 'Securing your logins, now with auto-renewal',
            vulgarizedDescription: 'We made sign-in safer and more convenient.',
          }) as unknown,
        }),
      );
    });

    it('deletes rows for items no longer among the fetched in-progress items (e.g. moved to Done)', async () => {
      prisma.boardConnection.findMany.mockResolvedValue([connection]);
      githubClient.fetchInProgressItems.mockResolvedValue([]); // nothing in progress anymore
      prisma.vulgarizedTask.findUnique.mockResolvedValue(null);

      await service.sweep();

      expect(prisma.vulgarizedTask.deleteMany).toHaveBeenCalledWith({
        where: { projectId: 'project-1', githubItemId: { notIn: [] } },
      });
    });

    it('only deletes rows for items that dropped out of the current in-progress set, not the ones still in it', async () => {
      prisma.boardConnection.findMany.mockResolvedValue([connection]);
      githubClient.fetchInProgressItems.mockResolvedValue([item]);
      prisma.vulgarizedTask.findUnique.mockResolvedValue(vulgarizedRow);

      await service.sweep();

      expect(prisma.vulgarizedTask.deleteMany).toHaveBeenCalledWith({
        where: {
          projectId: 'project-1',
          githubItemId: { notIn: ['PVTI_item1'] },
        },
      });
    });

    it('does not abort the sweep when one connection fails to fetch from GitHub', async () => {
      const otherConnection = {
        ...connection,
        id: 'connection-2',
        projectId: 'project-2',
      };
      prisma.boardConnection.findMany.mockResolvedValue([
        connection,
        otherConnection,
      ]);
      githubClient.fetchInProgressItems
        .mockRejectedValueOnce(new Error('GitHub is down'))
        .mockResolvedValueOnce([item]);
      prisma.vulgarizedTask.findUnique.mockResolvedValue(null);
      prisma.project.findUniqueOrThrow.mockResolvedValue(project);
      anthropicClient.vulgarize.mockResolvedValue({
        title: 'Securing your logins',
        description: null,
      });

      await service.sweep();

      expect(githubClient.fetchInProgressItems).toHaveBeenCalledTimes(2);
      expect(anthropicClient.vulgarize).toHaveBeenCalledTimes(2); // en + fr, for project-2 only
    });
  });

  describe('getVulgarizedCurrentTask', () => {
    it('returns the vulgarized rows for the given project and locale', async () => {
      prisma.vulgarizedTask.findMany.mockResolvedValue([vulgarizedRow]);

      const result = await service.getVulgarizedCurrentTask('project-1', 'en');

      expect(prisma.vulgarizedTask.findMany).toHaveBeenCalledWith({
        where: {
          projectId: 'project-1',
          locale: 'en',
          vulgarizedTitle: { not: null },
        },
      });
      expect(result).toEqual([
        {
          title: 'Securing your logins',
          description: 'We made sign-in safer for everyone.',
          updatedAt: vulgarizedRow.updatedAt.toISOString(),
        },
      ]);
    });

    it('returns an empty list when no vulgarization has ever succeeded for that (project, locale)', async () => {
      prisma.vulgarizedTask.findMany.mockResolvedValue([]);

      const result = await service.getVulgarizedCurrentTask('project-1', 'fr');

      expect(result).toEqual([]);
    });
  });
});
