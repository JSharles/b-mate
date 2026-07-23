import { Injectable, NotFoundException } from '@nestjs/common';
import { ProjectMember } from '@prisma/client';
import {
  CurrentTaskItem,
  GithubOwnerType,
  GithubProjectsClient,
} from '../board-connections/github-projects.client';
import { decryptToken } from '../board-connections/token-encryption';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CurrentTaskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly githubClient: GithubProjectsClient,
  ) {}

  // Open to any project member, not contributor-only (research.md Decision
  // 5) — this reads with the same token a contributor already holds, so
  // there's no security reason to block a contributor from calling it too.
  async getCurrentTask(
    userId: string,
    projectId: string,
  ): Promise<CurrentTaskItem[]> {
    await this.assertIsMember(userId, projectId);

    const connection = await this.prisma.boardConnection.findUnique({
      where: { projectId },
    });

    if (!connection) {
      return [];
    }

    try {
      const token = decryptToken(connection.encryptedToken);

      return await this.githubClient.fetchInProgressItems(
        token,
        connection.boardOwnerLogin,
        connection.boardOwnerType as GithubOwnerType,
        connection.boardNumber,
      );
    } catch {
      // Every failure below the membership check — a revoked token, a
      // GitHub outage, a decrypt error — collapses to "nothing in progress"
      // rather than surfacing to the client (research.md Decision 4, FR-005).
      // The contributor still learns their connection is broken via the
      // Board card itself (specs/005-github-project-connection), not here.
      return [];
    }
  }

  // Mirrors ProjectsService/BoardConnectionsService's own membership checks
  // — kept as a separate copy per Constitution III (Feature Isolation).
  private async assertIsMember(
    userId: string,
    projectId: string,
  ): Promise<ProjectMember> {
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    if (!membership) {
      throw new NotFoundException('Project not found');
    }

    return membership;
  }
}
