import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BoardProvider, ProjectMember } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBoardConnectionDto } from './dto/create-board-connection.dto';
import { PreviewBoardConnectionDto } from './dto/preview-board-connection.dto';
import { AvailableBoard, GithubProjectsClient } from './github-projects.client';
import { encryptToken } from './token-encryption';

export interface BoardConnectionDetails {
  provider: BoardProvider;
  boardOwnerLogin: string;
  boardOwnerType: string;
  boardNumber: number;
  boardTitle: string;
  boardUrl: string;
}

@Injectable()
export class BoardConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly githubClient: GithubProjectsClient,
  ) {}

  // Nothing is persisted here — just calls GitHub with the pasted token and
  // returns what it can see, for the developer to pick from (FR-001).
  async preview(
    userId: string,
    projectId: string,
    dto: PreviewBoardConnectionDto,
  ): Promise<AvailableBoard[]> {
    await this.assertIsContributor(userId, projectId);

    return this.callGithub(() =>
      this.githubClient.listAccessibleBoards(dto.token),
    );
  }

  // Re-validates access (FR-002) even though preview() already showed this
  // board — the two calls are a real round-trip apart. Upserts on
  // projectId so connecting a new board always replaces the old one in the
  // same operation (FR-006, research.md Decision 5).
  async connect(
    userId: string,
    projectId: string,
    dto: CreateBoardConnectionDto,
  ): Promise<BoardConnectionDetails> {
    await this.assertIsContributor(userId, projectId);

    const board = await this.callGithub(() =>
      this.githubClient.verifyBoardAccess(
        dto.token,
        dto.ownerLogin,
        dto.ownerType,
        dto.number,
      ),
    );

    if (!board) {
      throw new ForbiddenException('You do not have access to this board');
    }

    const encryptedToken = encryptToken(dto.token);
    const boardData = {
      provider: BoardProvider.github,
      boardOwnerLogin: board.ownerLogin,
      boardOwnerType: board.ownerType,
      boardNumber: board.number,
      boardTitle: board.title,
      boardUrl: board.url,
      encryptedToken,
    };

    const connection = await this.prisma.boardConnection.upsert({
      where: { projectId },
      create: { projectId, ...boardData },
      update: boardData,
    });

    return this.toDetails(connection);
  }

  async findForProject(
    userId: string,
    projectId: string,
  ): Promise<BoardConnectionDetails | null> {
    await this.assertIsContributor(userId, projectId);

    const connection = await this.prisma.boardConnection.findUnique({
      where: { projectId },
    });

    return connection ? this.toDetails(connection) : null;
  }

  // Idempotent from the caller's point of view — disconnecting when nothing
  // is connected is not an error (FR-005).
  async disconnect(userId: string, projectId: string): Promise<void> {
    await this.assertIsContributor(userId, projectId);

    await this.prisma.boardConnection.deleteMany({ where: { projectId } });
  }

  // Wraps every GithubProjectsClient call: a bad/expired token or a GitHub
  // outage must surface as a clean, sanitized 4xx the caller can act on —
  // never GithubProjectsClient's raw Error, which NestJS would otherwise
  // turn into an opaque 500 with no actionable message.
  private async callGithub<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch {
      throw new BadRequestException(
        "Unable to verify this token with GitHub. Check that it's valid and has access to Projects.",
      );
    }
  }

  private toDetails(
    connection: BoardConnectionDetails,
  ): BoardConnectionDetails {
    return {
      provider: connection.provider,
      boardOwnerLogin: connection.boardOwnerLogin,
      boardOwnerType: connection.boardOwnerType,
      boardNumber: connection.boardNumber,
      boardTitle: connection.boardTitle,
      boardUrl: connection.boardUrl,
    };
  }

  // Mirrors ProjectsService/InvitationsService's own assertIsMember —
  // kept as a separate copy per Constitution III (Feature Isolation): a
  // module's service must not reach into another module's Prisma queries.
  // A client-role member gets the exact same response as a non-member
  // (FR-009) — never a distinct "forbidden" that would confirm a connection
  // exists.
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
