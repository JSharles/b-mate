import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import {
  boardOAuthTokenCookieOptions,
  BOARD_OAUTH_TOKEN_COOKIE_NAME,
} from '../auth/board-oauth-cookie';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  GITHUB_BOARD_READ_SCOPE,
  GithubOauthClient,
} from '../auth/github-oauth.client';
import { resolveLocale } from '../auth/locale';
import {
  OAUTH_FLOW_COOKIE_NAME,
  oauthFlowCookieOptions,
  serializeOAuthFlowCookie,
} from '../auth/oauth-state-cookie';
import { SessionGuard } from '../auth/session.guard';
import { BoardConnectionsService } from './board-connections.service';
import { CreateBoardConnectionDto } from './dto/create-board-connection.dto';
import { PreviewBoardConnectionDto } from './dto/preview-board-connection.dto';
import { decryptToken } from './token-encryption';

@Controller('projects/:projectId/board-connection')
@UseGuards(SessionGuard)
export class BoardConnectionsController {
  constructor(
    private readonly boardConnectionsService: BoardConnectionsService,
    private readonly githubOauthClient: GithubOauthClient,
  ) {}

  @Get()
  findOne(@CurrentUser() user: User, @Param('projectId') projectId: string) {
    return this.boardConnectionsService.findForProject(user.id, projectId);
  }

  // specs/010-github-oauth-board-connection: starts the OAuth flow that
  // replaces the manual-PAT-paste step (FR-001). Shares the same callback
  // route as developer login (auth.controller.ts) — see oauth-state-cookie.ts.
  @Get('github/authorize')
  async authorizeGithub(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Query('locale') locale: string | undefined,
    @Res() res: Response,
  ) {
    await this.boardConnectionsService.assertIsContributor(user.id, projectId);

    const state = randomBytes(16).toString('hex');
    res.cookie(
      OAUTH_FLOW_COOKIE_NAME,
      serializeOAuthFlowCookie({
        state,
        locale: resolveLocale(locale),
        flow: 'board-connection',
        projectId,
      }),
      oauthFlowCookieOptions(),
    );
    res.redirect(
      this.githubOauthClient.buildAuthorizeUrl(state, GITHUB_BOARD_READ_SCOPE),
    );
  }

  @Post('preview')
  preview(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() dto: PreviewBoardConnectionDto,
    @Req() req: Request,
  ) {
    const token = this.resolveToken(req, dto.token);
    return this.boardConnectionsService.preview(user.id, projectId, token);
  }

  @Post()
  async connect(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() dto: CreateBoardConnectionDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.resolveToken(req, dto.token);
    try {
      return await this.boardConnectionsService.connect(
        user.id,
        projectId,
        token,
        {
          ownerLogin: dto.ownerLogin,
          ownerType: dto.ownerType,
          number: dto.number,
          estimateUnit: dto.estimateUnit,
        },
      );
    } finally {
      // The OAuth-obtained token (if any) is either now persisted
      // (encrypted, on the BoardConnection row) or the attempt failed —
      // either way this single-use cookie has served its purpose.
      res.clearCookie(
        BOARD_OAUTH_TOKEN_COOKIE_NAME,
        boardOAuthTokenCookieOptions(),
      );
    }
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  disconnect(@CurrentUser() user: User, @Param('projectId') projectId: string) {
    return this.boardConnectionsService.disconnect(user.id, projectId);
  }

  // Prefers the OAuth-obtained token (research.md Decision 5) over a
  // legacy pasted PAT in the request body (FR-007) when both are somehow
  // present; falls back to the body when there's no cookie at all.
  private resolveToken(req: Request, bodyToken: string | undefined): string {
    const cookieValue = req.cookies?.[BOARD_OAUTH_TOKEN_COOKIE_NAME] as
      string | undefined;
    if (cookieValue) {
      return decryptToken(cookieValue);
    }
    if (bodyToken) {
      return bodyToken;
    }
    throw new BadRequestException(
      'No GitHub authorization found. Connect via GitHub or provide a token.',
    );
  }
}
