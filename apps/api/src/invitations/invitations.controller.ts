import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionGuard } from '../auth/session.guard';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationsService } from './invitations.service';

@Controller('projects/:projectId/invitations')
@UseGuards(SessionGuard)
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post()
  create(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitationsService.create(user.id, projectId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: User, @Param('projectId') projectId: string) {
    return this.invitationsService.findAllForProject(user.id, projectId);
  }

  @Patch(':invitationId/cancel')
  cancel(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.invitationsService.cancel(user.id, projectId, invitationId);
  }

  @Post(':invitationId/resend')
  resend(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return this.invitationsService.resend(user.id, projectId, invitationId);
  }
}
