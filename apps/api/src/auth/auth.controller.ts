import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { encryptToken } from '../board-connections/token-encryption';
import { AuthService } from './auth.service';
import {
  boardOAuthTokenCookieOptions,
  BOARD_OAUTH_TOKEN_COOKIE_NAME,
} from './board-oauth-cookie';
import { CurrentUser } from './current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { GithubOauthClient, type GithubProfile } from './github-oauth.client';
import { DEFAULT_LOCALE, resolveLocale } from './locale';
import {
  OAUTH_FLOW_COOKIE_NAME,
  type OAuthFlowCookiePayload,
  oauthFlowCookieOptions,
  parseOAuthFlowCookie,
  serializeOAuthFlowCookie,
} from './oauth-state-cookie';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from './session-cookie';
import { SessionGuard } from './session.guard';
import { toPublicUser } from './to-public-user';

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

  @Patch('me')
  @UseGuards(SessionGuard)
  async updateMe(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    const updated = await this.authService.updateProfile(user.id, dto);
    return toPublicUser(updated);
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
    const resolvedLocale = resolveLocale(locale);
    const state = randomBytes(16).toString('hex');

    res.cookie(
      OAUTH_FLOW_COOKIE_NAME,
      serializeOAuthFlowCookie({
        state,
        locale: resolvedLocale,
        flow: 'login',
      }),
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
    const oauthFlow = parseOAuthFlowCookie(
      req.cookies?.[OAUTH_FLOW_COOKIE_NAME] as string | undefined,
    );
    res.clearCookie(OAUTH_FLOW_COOKIE_NAME, oauthFlowCookieOptions());
    const locale = oauthFlow?.locale ?? DEFAULT_LOCALE;

    // research.md Decision 3: no flow cookie, or a state that doesn't match
    // what we generated, means this callback is not trusted — no token
    // exchange, no account, no session.
    if (!oauthFlow || oauthFlow.state !== state) {
      return res.redirect(`${webOrigin}/${locale}/login?error=state_mismatch`);
    }

    // specs/010-github-oauth-board-connection: this callback route is
    // shared between the login flow and the board-connection flow (a
    // GitHub OAuth App only supports one registered callback URL) —
    // `oauthFlow.flow` says which one is in progress.
    if (oauthFlow.flow === 'board-connection') {
      return this.githubBoardConnectionCallback(code, oauthFlow, res);
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

  // specs/010-github-oauth-board-connection: the board-connection half of
  // the shared callback (see the `flow` branch above). Exchanges the code,
  // encrypts the resulting token into the short-lived board_oauth_token
  // cookie (research.md Decision 5), and sends the developer back to the
  // project's board-connection UI to pick a board — no account/session
  // logic here, the developer is already logged in to have started this.
  private async githubBoardConnectionCallback(
    code: string,
    oauthFlow: Extract<OAuthFlowCookiePayload, { flow: 'board-connection' }>,
    res: Response,
  ): Promise<void> {
    const webOrigin = process.env.WEB_ORIGIN;
    const { locale, projectId } = oauthFlow;
    // 2026-08-09: the dedicated Settings route was folded back into the
    // main project page (BoardConnectionCard now renders there directly,
    // as one of several linear sections) — the callback must land back on
    // the screen that actually renders it.
    const projectUrl = `${webOrigin}/${locale}/projects/${projectId}`;

    let accessToken: string;
    try {
      accessToken = await this.githubOauthClient.exchangeCodeForToken(code);
    } catch {
      res.redirect(`${projectUrl}?boardConnectError=github_auth_failed`);
      return;
    }

    res.cookie(
      BOARD_OAUTH_TOKEN_COOKIE_NAME,
      encryptToken(accessToken),
      boardOAuthTokenCookieOptions(),
    );
    res.redirect(`${projectUrl}?connectBoard=1`);
  }
}
