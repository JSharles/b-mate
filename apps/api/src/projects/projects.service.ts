import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountKind,
  Project,
  ProjectMember,
  ProjectMemberRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

export interface ProjectMemberDetails {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  isAdmin: boolean;
}

// The project plus the caller's own role/isAdmin on it — lets the frontend
// decide what the project page shows them. See docs/PRODUCT.md "Access".
export type ProjectDetails = Project & {
  role: ProjectMemberRole;
  isAdmin: boolean;
};

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  // The creator becomes a contributor and admin of their own project — see
  // docs/PRODUCT.md "Ownership & handoff" for why is_admin is independent of
  // role. Both rows are created in one transaction so a project never briefly
  // exists without a member able to manage it.
  //
  // A client-kind account can never create a project (specs/004-account-kind)
  // — developer and client are non-overlapping audiences by design, so this
  // is rejected at the API level, not merely hidden in the UI.
  async create(
    userId: string,
    accountKind: AccountKind,
    dto: CreateProjectDto,
  ): Promise<Project> {
    if (accountKind === 'client') {
      throw new ForbiddenException('Client accounts cannot create projects');
    }

    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: { title: dto.title },
      });

      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId,
          role: ProjectMemberRole.contributor,
          isAdmin: true,
        },
      });

      return project;
    });
  }

  findAllForUser(userId: string): Promise<Project[]> {
    return this.prisma.project.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneForUser(
    userId: string,
    projectId: string,
  ): Promise<ProjectDetails> {
    const membership = await this.assertIsMember(userId, projectId);

    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });

    return { ...project, role: membership.role, isAdmin: membership.isAdmin };
  }

  async update(
    userId: string,
    projectId: string,
    dto: UpdateProjectDto,
  ): Promise<Project> {
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    if (!membership) {
      throw new NotFoundException('Project not found');
    }

    if (membership.role !== ProjectMemberRole.contributor) {
      throw new ForbiddenException('Only a contributor can edit the project');
    }

    return this.prisma.project.update({
      where: { id: projectId },
      data: { title: dto.title },
    });
  }

  async findMembersForProject(
    userId: string,
    projectId: string,
  ): Promise<ProjectMemberDetails[]> {
    await this.assertIsMember(userId, projectId);

    const members = await this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });

    return members.map((member) => ({
      userId: member.user.id,
      firstName: member.user.firstName,
      lastName: member.user.lastName,
      email: member.user.email,
      isAdmin: member.isAdmin,
    }));
  }

  // A project must always keep at least one admin (docs/PRODUCT.md
  // "Integrity") — removing the last one is refused rather than leaving the
  // project unmanageable.
  async removeMember(
    userId: string,
    projectId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.assertIsAdmin(userId, projectId);

    const target = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });

    if (!target) {
      throw new NotFoundException('Member not found');
    }

    if (target.isAdmin) {
      const otherAdmins = await this.prisma.projectMember.findMany({
        where: { projectId, isAdmin: true },
      });

      if (
        otherAdmins.filter((admin) => admin.userId !== targetUserId).length ===
        0
      ) {
        throw new ConflictException(
          'A project must always have at least one admin',
        );
      }
    }

    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });
  }

  // Mirrors InvitationsService's own assertIsAdmin — kept as a separate copy
  // per Constitution III (Feature Isolation): a module's service must not
  // reach into another module's Prisma queries or internals.
  private async assertIsAdmin(
    userId: string,
    projectId: string,
  ): Promise<void> {
    const membership = await this.assertIsMember(userId, projectId);

    if (!membership.isAdmin) {
      throw new ForbiddenException('Only a project admin can manage members');
    }
  }

  // Confirms the caller belongs to the project (any role/admin status) and
  // returns their own membership row. Read access (viewing the project or
  // its member list) only requires membership; assertIsAdmin layers the
  // stricter admin check on top for management actions.
  private async assertIsMember(
    userId: string,
    projectId: string,
  ): Promise<ProjectMember> {
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    if (!membership) {
      // Same response whether the project doesn't exist or the caller isn't
      // a member — never confirm a project's existence to a non-member.
      throw new NotFoundException('Project not found');
    }

    return membership;
  }
}
