import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type {
  BoardConnection,
  EstimateSource,
  TaskComplexity,
} from '@prisma/client';
import {
  GithubAuthError,
  GithubOwnerType,
  GithubProjectsClient,
  InProgressItem,
} from '../board-connections/github-projects.client';
import { decryptToken } from '../board-connections/token-encryption';
import { PrismaService } from '../prisma/prisma.service';
import { AnthropicVulgarizationClient } from './anthropic-vulgarization.client';
import { Locale, SUPPORTED_LOCALES } from './locale';

// The public shape served to the frontend — no `id` (internal-only, see
// InProgressItem) and no `url` (dead since specs/006's own feedback round;
// see packages/schemas/src/current-task.ts). why/impact/status: 2026-08-09,
// replaces the old single `description` blob — see docs/PRODUCT.md
// "Working notes".
export interface CurrentTaskItem {
  title: string;
  why: string | null;
  impact: string | null;
  status: string | null;
  updatedAt: string;
  startedAt: string;
  estimatedCompletionAt: string | null;
  estimateConfidence: 'high' | 'medium' | 'low' | null;
}

// specs/008-current-task-progress FR-003a's fixed confidence matrix, as a
// pure function — one tested place, not re-derived at each call site
// (data-model.md). Board-sourced estimates read as more trustworthy than an
// AI guess regardless of complexity; within each source, a complex task's
// estimate is trusted less than a simple one's.
export function resolveConfidence(
  source: EstimateSource | null,
  complexity: TaskComplexity | null,
): 'high' | 'medium' | 'low' | null {
  if (!source || !complexity) return null;
  if (source === 'board') return complexity === 'simple' ? 'high' : 'medium';
  return complexity === 'simple' ? 'medium' : 'low';
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

@Injectable()
export class TaskVulgarizationService {
  private readonly logger = new Logger(TaskVulgarizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly githubClient: GithubProjectsClient,
    private readonly anthropicClient: AnthropicVulgarizationClient,
  ) {}

  // Fully decoupled from any frontend request (FR-003/FR-010, research.md
  // Decision 2) — this is the only thing that ever fetches from GitHub or
  // calls the LLM for this feature.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    const connections = await this.prisma.boardConnection.findMany();

    for (const connection of connections) {
      await this.processConnection(connection);
    }
  }

  private async processConnection(connection: BoardConnection): Promise<void> {
    let items: InProgressItem[];
    try {
      const token = decryptToken(connection.encryptedToken);
      items = await this.githubClient.fetchInProgressItems(
        token,
        connection.boardOwnerLogin,
        connection.boardOwnerType as GithubOwnerType,
        connection.boardNumber,
      );
    } catch (error) {
      // One broken connection must not abort the sweep for every other
      // project (spec.md Edge Cases) — log and move on. A GithubAuthError
      // specifically (401/403 — the token was revoked or is otherwise
      // invalid) additionally flags the connection for FR-008's "reconnect"
      // state; any other failure (network blip, GitHub outage) is
      // transient and gets retried next sweep without touching the flag
      // (specs/010-github-oauth-board-connection, research.md Decision 6).
      if (error instanceof GithubAuthError) {
        await this.prisma.boardConnection.update({
          where: { id: connection.id },
          data: { needsReconnect: true },
        });
      }
      this.logger.warn(
        `Failed to fetch in-progress items for project ${connection.projectId}: ${String(error)}`,
      );
      return;
    }

    // An item that is no longer in `items` (moved to Done, Status field
    // removed, etc.) must stop being served — otherwise it would linger in
    // vulgarized_tasks/task_progress and keep showing to the client forever,
    // since nothing else ever clears a row. Prisma's `notIn: []` matches
    // every row, so this correctly clears everything when nothing is in
    // progress anymore (specs/008 research.md Decision 7).
    const currentItemIds = items.map((item) => item.id);
    await this.prisma.vulgarizedTask.deleteMany({
      where: {
        projectId: connection.projectId,
        githubItemId: { notIn: currentItemIds },
      },
    });
    await this.prisma.taskProgress.deleteMany({
      where: {
        projectId: connection.projectId,
        githubItemId: { notIn: currentItemIds },
      },
    });

    for (const item of items) {
      // Once per item, not once per locale (specs/008 research.md Decision
      // 1) — start date/estimate/complexity are locale-independent.
      await this.processTaskProgress(connection, item);

      for (const locale of SUPPORTED_LOCALES) {
        await this.processItem(connection.projectId, item, locale);
      }
    }
  }

  private async processTaskProgress(
    connection: BoardConnection,
    item: InProgressItem,
  ): Promise<void> {
    const projectId = connection.projectId;
    const existing = await this.prisma.taskProgress.findUnique({
      where: {
        projectId_githubItemId: { projectId, githubItemId: item.id },
      },
    });

    // Set once, on first sight, and never touched again — the fallback
    // start date (FR-002/FR-006).
    const detectedStartedAt = existing?.detectedStartedAt ?? new Date();
    // Re-resolved every sweep: the board's own value wins once it appears,
    // even for an item that started out on the fallback (User Story 1,
    // Acceptance Scenario 3).
    const resolvedStartedAt = item.boardStartDate
      ? new Date(item.boardStartDate)
      : detectedStartedAt;

    // Only re-call the AI when the task's own content actually changed
    // (specs/008 research.md Decision 6) — a snapshot independent of
    // VulgarizedTask's own per-locale copies (research.md Decision 1).
    const contentChanged =
      !existing ||
      existing.lastEstimatedTitle !== item.title ||
      existing.lastEstimatedDescription !== item.description;

    let aiComplexity = existing?.aiComplexity ?? null;
    let aiEstimatedDurationDays = existing?.aiEstimatedDurationDays ?? null;
    let lastEstimatedTitle = existing?.lastEstimatedTitle ?? item.title;
    let lastEstimatedDescription =
      existing?.lastEstimatedDescription ?? item.description;

    if (contentChanged) {
      try {
        const output = await this.anthropicClient.estimateTask({
          taskTitle: item.title,
          taskDescription: item.description,
        });
        aiComplexity = output.complexity;
        aiEstimatedDurationDays = output.estimatedDurationDays;
        lastEstimatedTitle = item.title;
        lastEstimatedDescription = item.description;
      } catch (error) {
        // Mirrors VulgarizedTask's failure semantics (specs/007 research.md
        // Decision 4): leave everything untouched so the next sweep retries
        // against the same baseline, instead of silently freezing on a
        // stale AI estimate under content that no longer matches it.
        this.logger.warn(
          `Task estimate failed for item ${item.id}: ${String(error)}`,
        );
      }
    }

    // Three-tier priority order (FR-004): board Target date > board
    // Estimate (converted via the connection's unit) > the AI-supplied
    // duration. "Board-provided" covers both of the first two tiers for the
    // confidence matrix (FR-003a).
    let estimatedCompletionAt: Date | null = null;
    let estimateSource: EstimateSource | null = null;
    if (item.boardTargetDate) {
      estimatedCompletionAt = new Date(item.boardTargetDate);
      estimateSource = 'board';
    } else if (item.boardEstimateValue != null) {
      const durationDays =
        connection.estimateUnit === 'hours'
          ? item.boardEstimateValue / 24
          : item.boardEstimateValue;
      estimatedCompletionAt = addDays(resolvedStartedAt, durationDays);
      estimateSource = 'board';
    } else if (aiEstimatedDurationDays != null) {
      estimatedCompletionAt = addDays(
        resolvedStartedAt,
        aiEstimatedDurationDays,
      );
      estimateSource = 'ai';
    }

    await this.prisma.taskProgress.upsert({
      where: {
        projectId_githubItemId: { projectId, githubItemId: item.id },
      },
      create: {
        projectId,
        githubItemId: item.id,
        detectedStartedAt,
        resolvedStartedAt,
        estimatedCompletionAt,
        estimateSource,
        aiComplexity,
        aiEstimatedDurationDays,
        lastEstimatedTitle,
        lastEstimatedDescription,
      },
      update: {
        resolvedStartedAt,
        estimatedCompletionAt,
        estimateSource,
        aiComplexity,
        aiEstimatedDurationDays,
        lastEstimatedTitle,
        lastEstimatedDescription,
      },
    });
  }

  private async processItem(
    projectId: string,
    item: InProgressItem,
    locale: Locale,
  ): Promise<void> {
    const existing = await this.prisma.vulgarizedTask.findUnique({
      where: {
        projectId_githubItemId_locale: {
          projectId,
          githubItemId: item.id,
          locale,
        },
      },
    });

    // FR-004: skip the LLM call entirely when nothing changed.
    if (
      existing &&
      existing.originalTitle === item.title &&
      existing.originalDescription === item.description
    ) {
      return;
    }

    let vulgarizedTitle: string;
    let vulgarizedWhy: string | null;
    let vulgarizedImpact: string | null;
    let vulgarizedStatus: string | null;
    try {
      const project = await this.prisma.project.findUniqueOrThrow({
        where: { id: projectId },
      });
      const output = await this.anthropicClient.vulgarize({
        projectTitle: project.title,
        taskTitle: item.title,
        taskDescription: item.description,
        locale,
      });
      vulgarizedTitle = output.title;
      vulgarizedWhy = output.why;
      vulgarizedImpact = output.impact;
      vulgarizedStatus = output.status;
    } catch (error) {
      // research.md Decision 4: leave the row exactly as it was — do not
      // touch original* either, so the next sweep retries against the same
      // baseline instead of silently freezing on stale content (FR-007).
      this.logger.warn(
        `Vulgarization failed for item ${item.id} (${locale}): ${String(error)}`,
      );
      return;
    }

    // original* and vulgarized* are only ever written together, atomically.
    await this.prisma.vulgarizedTask.upsert({
      where: {
        projectId_githubItemId_locale: {
          projectId,
          githubItemId: item.id,
          locale,
        },
      },
      create: {
        projectId,
        githubItemId: item.id,
        locale,
        originalTitle: item.title,
        originalDescription: item.description,
        vulgarizedTitle,
        vulgarizedWhy,
        vulgarizedImpact,
        vulgarizedStatus,
      },
      update: {
        originalTitle: item.title,
        originalDescription: item.description,
        vulgarizedTitle,
        vulgarizedWhy,
        vulgarizedImpact,
        vulgarizedStatus,
      },
    });
  }

  // The only method current-task's read path calls — never touches GitHub
  // or the LLM (FR-003). Progress data was already resolved and persisted
  // during the sweep (specs/008 research.md Decision 4) — this is a pure
  // DB read, same guarantee as the vulgarized text itself.
  async getVulgarizedCurrentTask(
    projectId: string,
    locale: Locale,
  ): Promise<CurrentTaskItem[]> {
    const rows = await this.prisma.vulgarizedTask.findMany({
      where: { projectId, locale, vulgarizedTitle: { not: null } },
    });

    const items: CurrentTaskItem[] = [];
    for (const row of rows) {
      const progress = await this.prisma.taskProgress.findUnique({
        where: {
          projectId_githubItemId: {
            projectId,
            githubItemId: row.githubItemId,
          },
        },
      });

      items.push({
        title: row.vulgarizedTitle as string,
        why: row.vulgarizedWhy,
        impact: row.vulgarizedImpact,
        status: row.vulgarizedStatus,
        updatedAt: row.updatedAt.toISOString(),
        // Falls back to the vulgarized row's own updatedAt in the
        // defensive case where a TaskProgress row doesn't exist (never
        // blank, SC-001) — in practice processTaskProgress always runs
        // alongside processItem for every item, so this never fires.
        startedAt: (progress?.resolvedStartedAt ?? row.updatedAt).toISOString(),
        estimatedCompletionAt:
          progress?.estimatedCompletionAt?.toISOString() ?? null,
        estimateConfidence: resolveConfidence(
          progress?.estimateSource ?? null,
          progress?.aiComplexity ?? null,
        ),
      });
    }

    return items;
  }
}
