import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import type { GithubProfile } from './github-oauth.client';
import { SESSION_TTL_MS } from './session-cookie';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(dto: LoginDto): Promise<{ user: User; sessionId: string }> {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    // A GitHub-only developer account (specs/009) has no password to check
    // against — reject exactly like a wrong password, not a crash.
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const session = await this.createSession(user.id);
    return { user, sessionId: session.id };
  }

  // specs/009-developer-github-oauth: finds the developer account already
  // linked to this GitHub identity, or creates one — the single entry point
  // both GET /auth/github/callback branches (new vs. returning developer)
  // resolve to (FR-001/FR-003/FR-004).
  async findOrCreateFromGitHub(
    profile: GithubProfile,
  ): Promise<{ user: User; sessionId: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { githubId: profile.githubId },
    });

    const user = existing ?? (await this.createFromGithubProfile(profile));

    const session = await this.createSession(user.id);
    return { user, sessionId: session.id };
  }

  private async createFromGithubProfile(profile: GithubProfile): Promise<User> {
    // Split on the first space only. When GitHub has no `name` set (common
    // for personal accounts) this falls back to `login` — a single word, so
    // lastName is deliberately left empty rather than duplicating it: the
    // UI renders "{firstName} {lastName}", and repeating the username in
    // both fields showed up as "octocat octocat" (caught live, 2026-08-07).
    const nameParts = (profile.name ?? profile.login).trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    try {
      return await this.prisma.user.create({
        data: {
          firstName,
          lastName,
          // Caller (auth.controller.ts) never reaches here without a
          // verified email — see FR-006.
          email: profile.verifiedEmail!.toLowerCase(),
          passwordHash: null,
          accountKind: 'developer',
          githubId: profile.githubId,
          image: profile.avatarUrl,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // research.md Decision 6: this feature never links/merges with a
        // pre-existing account by email — a genuine collision is a dead end,
        // reported cleanly rather than as a raw constraint error.
        throw new ConflictException(
          'An account already exists with this email.',
        );
      }
      throw error;
    }
  }

  // Contact/social fields only — never firstName/lastName/email here (those
  // are identity, not profile info, and email in particular is tied to
  // login; changing it is a bigger, unscoped flow of its own).
  updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        roleTitle: dto.roleTitle,
        phone: dto.phone,
        github: dto.github,
        linkedin: dto.linkedin,
        malt: dto.malt,
        website: dto.website,
      },
    });
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  async validateSession(sessionId: string): Promise<User | null> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      return null;
    }

    return session.user;
  }

  // The language a person reads the product in, learned from the interface
  // rather than asked for. Background work — writing the reference document,
  // raising a point to clarify — has no browser to ask (specs/018, FR-024).
  async rememberLocale(userId: string, locale: string): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { locale } });
  }

  // Public: reused by InvitationsService when an invitation is accepted,
  // which also needs to sign the user in.
  createSession(userId: string) {
    return this.prisma.session.create({
      data: {
        userId,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
  }
}
