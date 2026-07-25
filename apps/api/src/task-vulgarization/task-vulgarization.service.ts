import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { BoardConnection } from '@prisma/client';
import {
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
// see packages/schemas/src/current-task.ts).
export interface CurrentTaskItem {
  title: string;
  description: string | null;
  updatedAt: string;
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
      // project (spec.md Edge Cases) — log and move on.
      this.logger.warn(
        `Failed to fetch in-progress items for project ${connection.projectId}: ${String(error)}`,
      );
      return;
    }

    // An item that is no longer in `items` (moved to Done, Status field
    // removed, etc.) must stop being served — otherwise it would linger in
    // vulgarized_tasks and keep showing to the client forever, since nothing
    // else ever clears a row. Prisma's `notIn: []` matches every row, so
    // this correctly clears everything when nothing is in progress anymore.
    await this.prisma.vulgarizedTask.deleteMany({
      where: {
        projectId: connection.projectId,
        githubItemId: { notIn: items.map((item) => item.id) },
      },
    });

    for (const item of items) {
      for (const locale of SUPPORTED_LOCALES) {
        await this.processItem(connection.projectId, item, locale);
      }
    }
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
    let vulgarizedDescription: string | null;
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
      vulgarizedDescription = output.description;
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
        vulgarizedDescription,
      },
      update: {
        originalTitle: item.title,
        originalDescription: item.description,
        vulgarizedTitle,
        vulgarizedDescription,
      },
    });
  }

  // The only method current-task's read path calls — never touches GitHub
  // or the LLM (FR-003).
  async getVulgarizedCurrentTask(
    projectId: string,
    locale: Locale,
  ): Promise<CurrentTaskItem[]> {
    const rows = await this.prisma.vulgarizedTask.findMany({
      where: { projectId, locale, vulgarizedTitle: { not: null } },
    });

    return rows.map((row) => ({
      title: row.vulgarizedTitle as string,
      description: row.vulgarizedDescription,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }
}
