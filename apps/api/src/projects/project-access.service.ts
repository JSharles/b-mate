import { Injectable, NotFoundException } from '@nestjs/common';
import { ProjectMember, ProjectMemberRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const HIDDEN_NOT_FOUND = { code: 'NOT_FOUND' } as const;

@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async requireMember(
    userId: string,
    projectId: string,
  ): Promise<ProjectMember> {
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (!membership) {
      this.hideProject();
    }
    return membership;
  }

  async requireContributor(
    userId: string,
    projectId: string,
  ): Promise<ProjectMember> {
    const membership = await this.requireMember(userId, projectId);
    if (membership.role !== ProjectMemberRole.contributor) {
      this.hideProject();
    }
    return membership;
  }

  async requireClient(
    userId: string,
    projectId: string,
  ): Promise<ProjectMember> {
    const membership = await this.requireMember(userId, projectId);
    if (membership.role !== ProjectMemberRole.client) {
      this.hideProject();
    }
    return membership;
  }

  private hideProject(): never {
    throw new NotFoundException(HIDDEN_NOT_FOUND);
  }
}
