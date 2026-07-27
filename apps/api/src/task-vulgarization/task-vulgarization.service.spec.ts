import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../test/prisma-mock';
import { GithubProjectsClient } from '../board-connections/github-projects.client';
import { encryptToken } from '../board-connections/token-encryption';
import { AnthropicVulgarizationClient } from './anthropic-vulgarization.client';
import {
  resolveConfidence,
  TaskVulgarizationService,
} from './task-vulgarization.service';

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
  estimateUnit: 'days' as const,
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
  boardStartDate: null,
  boardTargetDate: null,
  boardEstimateValue: null,
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

const taskProgressRow = {
  id: 'progress-1',
  projectId: 'project-1',
  githubItemId: 'PVTI_item1',
  detectedStartedAt: new Date('2026-07-20T10:00:00.000Z'),
  resolvedStartedAt: new Date('2026-07-20T10:00:00.000Z'),
  estimatedCompletionAt: new Date('2026-07-24T10:00:00.000Z'),
  estimateSource: 'ai' as const,
  aiComplexity: 'simple' as const,
  aiEstimatedDurationDays: 4,
  lastEstimatedTitle: item.title,
  lastEstimatedDescription: item.description,
  createdAt: new Date('2026-07-20T10:00:00.000Z'),
  updatedAt: new Date('2026-07-20T10:00:00.000Z'),
};

describe('TaskVulgarizationService', () => {
  let prisma: PrismaMock;
  let githubClient: jest.Mocked<
    Pick<GithubProjectsClient, 'fetchInProgressItems'>
  >;
  let anthropicClient: jest.Mocked<
    Pick<AnthropicVulgarizationClient, 'vulgarize' | 'estimateTask'>
  >;
  let service: TaskVulgarizationService;

  beforeEach(() => {
    process.env.BOARD_CONNECTION_ENCRYPTION_KEY =
      '0000000000000000000000000000000000000000000000000000000000000000';
    prisma = createPrismaMock();
    githubClient = { fetchInProgressItems: jest.fn() };
    anthropicClient = { vulgarize: jest.fn(), estimateTask: jest.fn() };
    service = new TaskVulgarizationService(
      asPrismaService(prisma),
      githubClient as unknown as GithubProjectsClient,
      anthropicClient as unknown as AnthropicVulgarizationClient,
    );
    // Neutral defaults so tests focused on vulgarization don't also have to
    // stub the task-progress path (and vice versa).
    prisma.taskProgress.findUnique.mockResolvedValue(null);
    anthropicClient.estimateTask.mockResolvedValue({
      estimatedDurationDays: 4,
      complexity: 'simple',
    });
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
      prisma.taskProgress.findUnique.mockResolvedValue(taskProgressRow);

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

    it('deletes vulgarizedTask and taskProgress rows for items no longer among the fetched in-progress items (e.g. moved to Done)', async () => {
      prisma.boardConnection.findMany.mockResolvedValue([connection]);
      githubClient.fetchInProgressItems.mockResolvedValue([]); // nothing in progress anymore
      prisma.vulgarizedTask.findUnique.mockResolvedValue(null);

      await service.sweep();

      expect(prisma.vulgarizedTask.deleteMany).toHaveBeenCalledWith({
        where: { projectId: 'project-1', githubItemId: { notIn: [] } },
      });
      expect(prisma.taskProgress.deleteMany).toHaveBeenCalledWith({
        where: { projectId: 'project-1', githubItemId: { notIn: [] } },
      });
    });

    it('only deletes rows for items that dropped out of the current in-progress set, not the ones still in it', async () => {
      prisma.boardConnection.findMany.mockResolvedValue([connection]);
      githubClient.fetchInProgressItems.mockResolvedValue([item]);
      prisma.vulgarizedTask.findUnique.mockResolvedValue(vulgarizedRow);
      prisma.taskProgress.findUnique.mockResolvedValue(taskProgressRow);

      await service.sweep();

      expect(prisma.vulgarizedTask.deleteMany).toHaveBeenCalledWith({
        where: {
          projectId: 'project-1',
          githubItemId: { notIn: ['PVTI_item1'] },
        },
      });
      expect(prisma.taskProgress.deleteMany).toHaveBeenCalledWith({
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

  // specs/008-current-task-progress User Story 1: start date.
  describe('sweep — task progress (start date)', () => {
    it('creates a TaskProgress row with detectedStartedAt ≈ now for a brand-new item', async () => {
      prisma.boardConnection.findMany.mockResolvedValue([connection]);
      githubClient.fetchInProgressItems.mockResolvedValue([item]);
      prisma.vulgarizedTask.findUnique.mockResolvedValue(null);
      prisma.project.findUniqueOrThrow.mockResolvedValue(project);
      anthropicClient.vulgarize.mockResolvedValue({
        title: 'Securing your logins',
        description: null,
      });
      const before = Date.now();

      await service.sweep();

      const [call] = prisma.taskProgress.upsert.mock.calls[0] as [
        { create: { detectedStartedAt: Date; resolvedStartedAt: Date } },
      ];
      expect(call.create.detectedStartedAt.getTime()).toBeGreaterThanOrEqual(
        before,
      );
      expect(call.create.resolvedStartedAt).toEqual(
        call.create.detectedStartedAt,
      );
    });

    it('uses the board Start date instead of the fallback when present', async () => {
      const itemWithStartDate = { ...item, boardStartDate: '2026-07-01' };
      prisma.boardConnection.findMany.mockResolvedValue([connection]);
      githubClient.fetchInProgressItems.mockResolvedValue([itemWithStartDate]);
      prisma.vulgarizedTask.findUnique.mockResolvedValue(vulgarizedRow);
      prisma.taskProgress.findUnique.mockResolvedValue(taskProgressRow); // fallback already recorded

      await service.sweep();

      const [call] = prisma.taskProgress.upsert.mock.calls[0] as [
        { update: { resolvedStartedAt: Date } },
      ];
      expect(call.update.resolvedStartedAt).toEqual(new Date('2026-07-01'));
    });

    it('does not reset detectedStartedAt when the item content changes on a later sweep', async () => {
      const changedItem = { ...item, title: 'Refactor auth middleware (v2)' };
      prisma.boardConnection.findMany.mockResolvedValue([connection]);
      githubClient.fetchInProgressItems.mockResolvedValue([changedItem]);
      prisma.vulgarizedTask.findUnique.mockResolvedValue(vulgarizedRow);
      prisma.taskProgress.findUnique.mockResolvedValue(taskProgressRow);
      anthropicClient.vulgarize.mockResolvedValue({
        title: 'Securing your logins v2',
        description: null,
      });

      await service.sweep();

      // detectedStartedAt is only ever set inside `create` (an existing
      // row's upsert never re-supplies it in `update`) — an existing row
      // means Prisma applies `update`, which never touches this field, so
      // it can't be reset by a later sweep.
      const [call] = prisma.taskProgress.upsert.mock.calls[0] as [
        { update: Record<string, unknown> },
      ];
      expect(call.update).not.toHaveProperty('detectedStartedAt');
    });
  });

  // specs/008-current-task-progress User Story 2: estimate + progress data.
  describe('sweep — task progress (estimate resolution)', () => {
    it('calls estimateTask when content changed or no prior success exists, skips it when unchanged', async () => {
      prisma.boardConnection.findMany.mockResolvedValue([connection]);
      githubClient.fetchInProgressItems.mockResolvedValue([item]);
      prisma.vulgarizedTask.findUnique.mockResolvedValue(vulgarizedRow);
      prisma.taskProgress.findUnique.mockResolvedValue(taskProgressRow); // same title/description as `item`

      await service.sweep();

      expect(anthropicClient.estimateTask).not.toHaveBeenCalled();
    });

    it('resolves estimatedCompletionAt from the board Target date when present, ignoring Estimate/AI entirely', async () => {
      const itemWithTarget = {
        ...item,
        boardTargetDate: '2026-08-01',
        boardEstimateValue: 999, // must be ignored — Target date wins
      };
      prisma.boardConnection.findMany.mockResolvedValue([connection]);
      githubClient.fetchInProgressItems.mockResolvedValue([itemWithTarget]);
      prisma.vulgarizedTask.findUnique.mockResolvedValue(vulgarizedRow);
      prisma.taskProgress.findUnique.mockResolvedValue(null);
      anthropicClient.estimateTask.mockResolvedValue({
        estimatedDurationDays: 1,
        complexity: 'simple',
      });

      await service.sweep();

      const [call] = prisma.taskProgress.upsert.mock.calls[0] as [
        {
          create: {
            estimatedCompletionAt: Date;
            estimateSource: string;
          };
        },
      ];
      expect(call.create.estimatedCompletionAt).toEqual(new Date('2026-08-01'));
      expect(call.create.estimateSource).toBe('board');
    });

    it('falls back to Estimate + connection unit when Target date is absent', async () => {
      const itemWithEstimate = { ...item, boardEstimateValue: 4 };
      prisma.boardConnection.findMany.mockResolvedValue([connection]); // estimateUnit: "days"
      githubClient.fetchInProgressItems.mockResolvedValue([itemWithEstimate]);
      prisma.vulgarizedTask.findUnique.mockResolvedValue(vulgarizedRow);
      prisma.taskProgress.findUnique.mockResolvedValue(null);

      await service.sweep();

      const [call] = prisma.taskProgress.upsert.mock.calls[0] as [
        {
          create: {
            resolvedStartedAt: Date;
            estimatedCompletionAt: Date;
            estimateSource: string;
          };
        },
      ];
      const expected = new Date(
        call.create.resolvedStartedAt.getTime() + 4 * 24 * 60 * 60 * 1000,
      );
      expect(call.create.estimatedCompletionAt).toEqual(expected);
      expect(call.create.estimateSource).toBe('board');
    });

    it('falls back to the AI-supplied duration when the board provides neither Target date nor Estimate', async () => {
      prisma.boardConnection.findMany.mockResolvedValue([connection]);
      githubClient.fetchInProgressItems.mockResolvedValue([item]);
      prisma.vulgarizedTask.findUnique.mockResolvedValue(vulgarizedRow);
      prisma.taskProgress.findUnique.mockResolvedValue(null);
      anthropicClient.estimateTask.mockResolvedValue({
        estimatedDurationDays: 7,
        complexity: 'complex',
      });

      await service.sweep();

      const [call] = prisma.taskProgress.upsert.mock.calls[0] as [
        {
          create: {
            resolvedStartedAt: Date;
            estimatedCompletionAt: Date;
            estimateSource: string;
            aiComplexity: string;
          };
        },
      ];
      const expected = new Date(
        call.create.resolvedStartedAt.getTime() + 7 * 24 * 60 * 60 * 1000,
      );
      expect(call.create.estimatedCompletionAt).toEqual(expected);
      expect(call.create.estimateSource).toBe('ai');
      expect(call.create.aiComplexity).toBe('complex');
    });

    it('leaves no estimate at all when the board provides nothing and the AI call fails', async () => {
      prisma.boardConnection.findMany.mockResolvedValue([connection]);
      githubClient.fetchInProgressItems.mockResolvedValue([item]);
      prisma.vulgarizedTask.findUnique.mockResolvedValue(vulgarizedRow);
      prisma.taskProgress.findUnique.mockResolvedValue(null);
      anthropicClient.estimateTask.mockRejectedValue(new Error('LLM timeout'));

      await service.sweep();

      const [call] = prisma.taskProgress.upsert.mock.calls[0] as [
        {
          create: {
            estimatedCompletionAt: Date | null;
            estimateSource: string | null;
          };
        },
      ];
      expect(call.create.estimatedCompletionAt).toBeNull();
      expect(call.create.estimateSource).toBeNull();
    });

    it('leaves the previous aiComplexity/estimate untouched when a later estimateTask call fails (matches specs/007 failure-retry precedent)', async () => {
      const changedItem = { ...item, title: 'Refactor auth middleware (v2)' };
      prisma.boardConnection.findMany.mockResolvedValue([connection]);
      githubClient.fetchInProgressItems.mockResolvedValue([changedItem]);
      prisma.vulgarizedTask.findUnique.mockResolvedValue(vulgarizedRow);
      prisma.taskProgress.findUnique.mockResolvedValue(taskProgressRow); // prior success: simple, 4 days
      anthropicClient.vulgarize.mockResolvedValue({
        title: 'Securing your logins v2',
        description: null,
      });
      anthropicClient.estimateTask.mockRejectedValue(new Error('LLM timeout'));

      await service.sweep();

      const [call] = prisma.taskProgress.upsert.mock.calls[0] as [
        {
          update: {
            aiComplexity: string;
            lastEstimatedTitle: string;
          };
        },
      ];
      expect(call.update.aiComplexity).toBe('simple'); // unchanged from taskProgressRow
      expect(call.update.lastEstimatedTitle).toBe(item.title); // NOT updated to changedItem's title — retry next sweep
    });
  });

  // specs/008-current-task-progress User Story 4: confidence.
  describe('sweep — task progress (complexity always computed)', () => {
    it('still calls estimateTask (and stores aiComplexity) even when the board already supplies a Target date', async () => {
      const itemWithTarget = { ...item, boardTargetDate: '2026-08-01' };
      prisma.boardConnection.findMany.mockResolvedValue([connection]);
      githubClient.fetchInProgressItems.mockResolvedValue([itemWithTarget]);
      prisma.vulgarizedTask.findUnique.mockResolvedValue(vulgarizedRow);
      prisma.taskProgress.findUnique.mockResolvedValue(null);
      anthropicClient.estimateTask.mockResolvedValue({
        estimatedDurationDays: 2,
        complexity: 'complex',
      });

      await service.sweep();

      expect(anthropicClient.estimateTask).toHaveBeenCalled();
      const [call] = prisma.taskProgress.upsert.mock.calls[0] as [
        { create: { aiComplexity: string; estimateSource: string } },
      ];
      expect(call.create.aiComplexity).toBe('complex');
      expect(call.create.estimateSource).toBe('board'); // Target date still wins for the shown estimate
    });
  });

  // specs/008-current-task-progress User Story 3: board precedence, per field.
  describe('sweep — task progress (board precedence)', () => {
    it('resolves startedAt from the board and estimatedCompletionAt from the AI independently (per-field, not all-or-nothing)', async () => {
      const itemStartOnly = { ...item, boardStartDate: '2026-07-01' };
      prisma.boardConnection.findMany.mockResolvedValue([connection]);
      githubClient.fetchInProgressItems.mockResolvedValue([itemStartOnly]);
      prisma.vulgarizedTask.findUnique.mockResolvedValue(vulgarizedRow);
      prisma.taskProgress.findUnique.mockResolvedValue(null);
      anthropicClient.estimateTask.mockResolvedValue({
        estimatedDurationDays: 3,
        complexity: 'simple',
      });

      await service.sweep();

      const [call] = prisma.taskProgress.upsert.mock.calls[0] as [
        {
          create: {
            resolvedStartedAt: Date;
            estimateSource: string;
          };
        },
      ];
      expect(call.create.resolvedStartedAt).toEqual(new Date('2026-07-01'));
      expect(call.create.estimateSource).toBe('ai');
    });

    it('switches a fallback detectedStartedAt to the board Start date on the very next sweep once the developer fills the field in', async () => {
      const itemWithStartDate = { ...item, boardStartDate: '2026-07-01' };
      prisma.boardConnection.findMany.mockResolvedValue([connection]);
      githubClient.fetchInProgressItems.mockResolvedValue([itemWithStartDate]);
      prisma.vulgarizedTask.findUnique.mockResolvedValue(vulgarizedRow);
      // Previous sweep recorded a fallback (no board Start date yet).
      prisma.taskProgress.findUnique.mockResolvedValue({
        ...taskProgressRow,
        resolvedStartedAt: taskProgressRow.detectedStartedAt,
      });

      await service.sweep();

      const [call] = prisma.taskProgress.upsert.mock.calls[0] as [
        { update: { resolvedStartedAt: Date } },
      ];
      expect(call.update.resolvedStartedAt).toEqual(new Date('2026-07-01'));
      expect(call.update.resolvedStartedAt).not.toEqual(
        taskProgressRow.detectedStartedAt,
      );
    });

    it('applies the connection estimateUnit: the same Estimate number produces a different date under "hours" than under "days"', async () => {
      const itemWithEstimate = { ...item, boardEstimateValue: 24 };
      const hourlyConnection = {
        ...connection,
        estimateUnit: 'hours' as const,
      };
      prisma.boardConnection.findMany.mockResolvedValue([hourlyConnection]);
      githubClient.fetchInProgressItems.mockResolvedValue([itemWithEstimate]);
      prisma.vulgarizedTask.findUnique.mockResolvedValue(vulgarizedRow);
      prisma.taskProgress.findUnique.mockResolvedValue(null);

      await service.sweep();

      const [call] = prisma.taskProgress.upsert.mock.calls[0] as [
        { create: { resolvedStartedAt: Date; estimatedCompletionAt: Date } },
      ];
      // 24 hours = 1 day, not 24 days.
      const expected = new Date(
        call.create.resolvedStartedAt.getTime() + 1 * 24 * 60 * 60 * 1000,
      );
      expect(call.create.estimatedCompletionAt).toEqual(expected);
    });
  });

  describe('getVulgarizedCurrentTask', () => {
    it('returns the vulgarized rows for the given project and locale, enriched with progress data', async () => {
      prisma.vulgarizedTask.findMany.mockResolvedValue([vulgarizedRow]);
      prisma.taskProgress.findUnique.mockResolvedValue(taskProgressRow);

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
          startedAt: taskProgressRow.resolvedStartedAt.toISOString(),
          estimatedCompletionAt:
            taskProgressRow.estimatedCompletionAt.toISOString(),
          estimateConfidence: 'medium', // ai + simple
        },
      ]);
    });

    it('returns null estimatedCompletionAt/estimateConfidence when no TaskProgress row exists yet', async () => {
      prisma.vulgarizedTask.findMany.mockResolvedValue([vulgarizedRow]);
      prisma.taskProgress.findUnique.mockResolvedValue(null);

      const result = await service.getVulgarizedCurrentTask('project-1', 'en');

      expect(result[0].estimatedCompletionAt).toBeNull();
      expect(result[0].estimateConfidence).toBeNull();
      expect(result[0].startedAt).toBe(vulgarizedRow.updatedAt.toISOString()); // defensive fallback
    });

    it('returns an empty list when no vulgarization has ever succeeded for that (project, locale)', async () => {
      prisma.vulgarizedTask.findMany.mockResolvedValue([]);

      const result = await service.getVulgarizedCurrentTask('project-1', 'fr');

      expect(result).toEqual([]);
    });
  });
});

describe('resolveConfidence', () => {
  it('returns high for a board-sourced estimate on a simple task', () => {
    expect(resolveConfidence('board', 'simple')).toBe('high');
  });

  it('returns medium for a board-sourced estimate on a complex task', () => {
    expect(resolveConfidence('board', 'complex')).toBe('medium');
  });

  it('returns medium for an AI-sourced estimate on a simple task', () => {
    expect(resolveConfidence('ai', 'simple')).toBe('medium');
  });

  it('returns low for an AI-sourced estimate on a complex task', () => {
    expect(resolveConfidence('ai', 'complex')).toBe('low');
  });

  it('returns null when there is no source', () => {
    expect(resolveConfidence(null, 'simple')).toBeNull();
  });

  it('returns null when there is no complexity judgment', () => {
    expect(resolveConfidence('board', null)).toBeNull();
  });
});
