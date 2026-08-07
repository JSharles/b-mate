import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { GithubOauthClient, type GithubProfile } from './github-oauth.client';
import {
  OAUTH_FLOW_COOKIE_NAME,
  oauthFlowCookieOptions,
  parseOAuthFlowCookie,
  serializeOAuthFlowCookie,
} from './oauth-state-cookie';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from './session-cookie';
import { SessionGuard } from './session.guard';
import { toPublicUser } from './to-public-user';

const SUPPORTED_LOCALES = ['fr', 'en'] as const;
const DEFAULT_LOCALE = 'fr';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly githubOauthClient: GithubOauthClient,
  ) {}

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

  // specs/009-developer-github-oauth: the sole developer-facing entry point
  // — one action serves both sign-up and login (FR-001). `locale` is passed
  // by the frontend link itself (research.md Decision 9) and round-tripped
  // through the flow cookie so the callback knows where to send the
  // developer back.
  @Get('github')
  githubStart(
    @Query('locale') locale: string | undefined,
    @Res() res: Response,
  ) {
    const resolvedLocale = SUPPORTED_LOCALES.includes(
      locale as (typeof SUPPORTED_LOCALES)[number],
    )
      ? (locale as (typeof SUPPORTED_LOCALES)[number])
      : DEFAULT_LOCALE;
    const state = randomBytes(16).toString('hex');

    res.cookie(
      OAUTH_FLOW_COOKIE_NAME,
      serializeOAuthFlowCookie({ state, locale: resolvedLocale }),
      oauthFlowCookieOptions(),
    );
    res.redirect(this.githubOauthClient.buildAuthorizeUrl(state));
  }

  @Get('github/callback')
  async githubCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const webOrigin = process.env.WEB_ORIGIN;
    const flow = parseOAuthFlowCookie(
      req.cookies?.[OAUTH_FLOW_COOKIE_NAME] as string | undefined,
    );
    res.clearCookie(OAUTH_FLOW_COOKIE_NAME, oauthFlowCookieOptions());
    const locale = flow?.locale ?? DEFAULT_LOCALE;

    // research.md Decision 3: no flow cookie, or a state that doesn't match
    // what we generated, means this callback is not trusted — no token
    // exchange, no account, no session.
    if (!flow || flow.state !== state) {
      return res.redirect(`${webOrigin}/${locale}/login?error=state_mismatch`);
    }

    let profile: GithubProfile;
    try {
      const accessToken =
        await this.githubOauthClient.exchangeCodeForToken(code);
      profile = await this.githubOauthClient.fetchProfile(accessToken);
    } catch {
      return res.redirect(
        `${webOrigin}/${locale}/login?error=github_auth_failed`,
      );
    }

    // FR-006: no email/password fallback — block and ask the developer to
    // verify an email on GitHub, then retry.
    if (!profile.verifiedEmail) {
      return res.redirect(
        `${webOrigin}/${locale}/login?error=github_email_required`,
      );
    }

    const { sessionId } =
      await this.authService.findOrCreateFromGitHub(profile);
    res.cookie(SESSION_COOKIE_NAME, sessionId, sessionCookieOptions());
    return res.redirect(`${webOrigin}/${locale}/home`);
  }
}
