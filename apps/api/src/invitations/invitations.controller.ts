import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
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
}
