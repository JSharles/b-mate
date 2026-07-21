import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from '../auth/session-cookie';
import { toPublicUser } from '../auth/to-public-user';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { InvitationsService } from './invitations.service';

// Separate from InvitationsController (`/projects/:projectId/invitations`,
// admin-only) — this one is public, addressed by token, and used by the
// invitee before they have a session.
@Controller('invitations')
export class InvitationAcceptanceController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get(':token')
  getByToken(@Param('token') token: string) {
    return this.invitationsService.getByToken(token);
  }

  @Post(':token/accept')
  @HttpCode(200)
  async accept(
    @Param('token') token: string,
    @Body() dto: AcceptInvitationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, sessionId } = await this.invitationsService.accept(
      token,
      dto,
    );
    res.cookie(SESSION_COOKIE_NAME, sessionId, sessionCookieOptions());
    return toPublicUser(user);
  }
}
