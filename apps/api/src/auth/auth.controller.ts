import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from './session-cookie';
import { SessionGuard } from './session.guard';

function toPublicUser(user: User) {
  const { passwordHash, ...publicUser } = user;
  return publicUser;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(
    @Body() dto: SignupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, sessionId } = await this.authService.signup(dto);
    res.cookie(SESSION_COOKIE_NAME, sessionId, sessionCookieOptions());
    return toPublicUser(user);
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, sessionId } = await this.authService.login(dto);
    res.cookie(SESSION_COOKIE_NAME, sessionId, sessionCookieOptions());
    return toPublicUser(user);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const sessionId = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    if (sessionId) {
      await this.authService.logout(sessionId);
    }
    res.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
    return { success: true };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: User) {
    return toPublicUser(user);
  }
}
