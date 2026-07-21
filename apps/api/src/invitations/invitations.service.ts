import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Invitation, ProjectMemberRole, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface InvitationDetails {
  email: string;
  projectTitle: string;
  accountExists: boolean;
  status: 'invited' | 'expired' | 'accepted';
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  // Only a project admin can invite — is_admin is what governs member
  // management (see docs/PRODUCT.md "Business rules" § Access). The invitee
  // is always granted client + admin by default, matching the "Ownership &
  // handoff" rule for a project's first client.
  async create(
    userId: string,
    projectId: string,
    dto: CreateInvitationDto,
  ): Promise<Invitation> {
    await this.assertIsAdmin(userId, projectId);

    return this.prisma.invitation.create({
      data: {
        projectId,
        email: dto.email.toLowerCase(),
        role: ProjectMemberRole.client,
        isAdmin: true,
        token: randomBytes(32).toString('hex'),
        status: 'invited',
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });
  }

  async findAllForProject(
    userId: string,
    projectId: string,
  ): Promise<Invitation[]> {
    await this.assertIsAdmin(userId, projectId);

    return this.prisma.invitation.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Public (no session) — read by the invite acceptance page before the
  // invitee has an account, so it can decide whether to show a signup or a
  // login form. Revealing account existence here is fine: only the holder
  // of this specific unguessable token learns it, about their own email.
  async getByToken(token: string): Promise<InvitationDetails> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { project: { select: { title: true } } },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: invitation.email },
    });

    return {
      email: invitation.email,
      projectTitle: invitation.project.title,
      accountExists: !!existingUser,
      status:
        invitation.status === 'accepted'
          ? 'accepted'
          : invitation.expiresAt < new Date()
            ? 'expired'
            : 'invited',
    };
  }

  // Signs the invitee in (creating their account first if this is their
  // first invitation anywhere) and grants them the role/admin flag decided
  // at invite time. Idempotent on membership: accepting twice never creates
  // a duplicate ProjectMember row.
  async accept(
    token: string,
    dto: AcceptInvitationDto,
  ): Promise<{ user: User; sessionId: string }> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.status === 'accepted') {
      throw new GoneException('Invitation already accepted');
    }
    if (invitation.expiresAt < new Date()) {
      throw new GoneException('Invitation has expired');
    }

    let user = await this.prisma.user.findUnique({
      where: { email: invitation.email },
    });

    if (user) {
      const valid = await argon2.verify(user.passwordHash, dto.password);
      if (!valid) {
        throw new UnauthorizedException('Invalid credentials');
      }
    } else {
      if (!dto.firstName || !dto.lastName) {
        throw new BadRequestException(
          'firstName and lastName are required to create an account',
        );
      }

      const passwordHash = await argon2.hash(dto.password);
      user = await this.prisma.user.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: invitation.email,
          passwordHash,
        },
      });
    }

    const existingMembership = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: invitation.projectId, userId: user.id },
      },
    });

    if (!existingMembership) {
      await this.prisma.projectMember.create({
        data: {
          projectId: invitation.projectId,
          userId: user.id,
          role: invitation.role,
          isAdmin: invitation.isAdmin,
        },
      });
    }

    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'accepted' },
    });

    const session = await this.authService.createSession(user.id);
    return { user, sessionId: session.id };
  }

  private async assertIsAdmin(
    userId: string,
    projectId: string,
  ): Promise<void> {
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    if (!membership) {
      // Same response whether the project doesn't exist or the user isn't a
      // member — never confirm a project's existence to a non-member.
      throw new NotFoundException('Project not found');
    }

    if (!membership.isAdmin) {
      throw new ForbiddenException(
        'Only a project admin can manage invitations',
      );
    }
  }
}
