import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { SESSION_TTL_MS } from './session-cookie';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async signup(dto: SignupDto): Promise<{ user: User; sessionId: string }> {
    const email = dto.email.toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Deliberately generic: doesn't confirm-by-name that this email is
      // already registered, to reduce (not eliminate — the 409 status/timing
      // still differs from a successful signup) account enumeration via this
      // form. Full request-shape neutrality would need an email-verification
      // step, which doesn't exist yet — see docs/PRODUCT.md open decisions.
      throw new ConflictException(
        "We couldn't create your account with these details. If you already have one, try logging in instead.",
      );
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email,
        passwordHash,
        accountKind: dto.accountKind,
      },
    });

    const session = await this.createSession(user.id);
    return { user, sessionId: session.id };
  }

  async login(dto: LoginDto): Promise<{ user: User; sessionId: string }> {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const session = await this.createSession(user.id);
    return { user, sessionId: session.id };
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
