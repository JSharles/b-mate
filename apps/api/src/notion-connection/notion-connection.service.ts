import { Injectable, NotFoundException } from '@nestjs/common';
import { ProjectMember } from '@prisma/client';
import {
  decryptToken,
  encryptToken,
} from '../board-connections/token-encryption';
import { PrismaService } from '../prisma/prisma.service';
import { NotionClient } from './notion.client';

export interface NotionConnectionStatus {
  connected: boolean;
  // The workspace/integration name captured at connect time (NotionClient.
  // verifyToken) — null only when nothing is connected.
  workspaceName: string | null;
}

// specs/012-project-settings: a project-level, standalone connection —
// connecting/reconnecting/disconnecting is now independent of adding any
// particular Notion-sourced resource (research.md Decision 1). Mirrors
// BoardConnectionsService's shape (assertIsContributor, verify-then-persist,
// idempotent disconnect).
@Injectable()
export class NotionConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notionClient: NotionClient,
  ) {}

  async findForProject(
    userId: string,
    projectId: string,
  ): Promise<NotionConnectionStatus> {
    await this.assertIsContributor(userId, projectId);

    const connection = await this.prisma.notionConnection.findUnique({
      where: { projectId },
    });

    return {
      connected: connection !== null,
      workspaceName: connection?.workspaceName ?? null,
    };
  }

  // Verifies the token against Notion's own API before persisting it
  // (research.md Decision 2) — mirrors BoardConnectionsService.connect()'s
  // re-verify-before-persist pattern. Upserts on projectId, so connecting a
  // new token always replaces the old one in the same operation. Stores the
  // workspace identity verifyToken() returns, so the developer sees *what*
  // they connected (2026-08-08 critique, P1) instead of a bare boolean.
  async connect(
    userId: string,
    projectId: string,
    token: string,
  ): Promise<NotionConnectionStatus> {
    await this.assertIsContributor(userId, projectId);

    const identity = await this.notionClient.verifyToken(token);

    const encryptedToken = encryptToken(token);
    await this.prisma.notionConnection.upsert({
      where: { projectId },
      create: { projectId, encryptedToken, workspaceName: identity.name },
      update: { encryptedToken, workspaceName: identity.name },
    });

    return { connected: true, workspaceName: identity.name };
  }

  // Idempotent from the caller's point of view — disconnecting when
  // nothing is connected is not an error (mirrors
  // BoardConnectionsService.disconnect()).
  async disconnect(userId: string, projectId: string): Promise<void> {
    await this.assertIsContributor(userId, projectId);

    await this.prisma.notionConnection.deleteMany({ where: { projectId } });
  }

  // For `resources` to resolve the stored token when creating a
  // Notion-sourced resource — no membership check here, the caller
  // (ResourcesService.createFromNotion) already did its own.
  async getDecryptedToken(projectId: string): Promise<string | null> {
    const connection = await this.prisma.notionConnection.findUnique({
      where: { projectId },
    });

    return connection ? decryptToken(connection.encryptedToken) : null;
  }

  // Mirrors BoardConnectionsService/ResourcesService's own membership
  // checks — kept as a separate copy per Constitution III (Feature
  // Isolation). A client-role member gets the exact same response as a
  // non-member.
  private async assertIsContributor(
    userId: string,
    projectId: string,
  ): Promise<ProjectMember> {
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    if (!membership || membership.role !== 'contributor') {
      throw new NotFoundException('Project not found');
    }

    return membership;
  }
}
