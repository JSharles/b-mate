import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../auth/current-user.decorator';
import { SessionGuard } from '../../auth/session.guard';
import {
  ConfirmEditorialProposalDto,
  EditorialProfileProposalDto,
  EditorialProposalActionDto,
} from '../dto/editorial-profile.dto';
import { EditorialProfileService } from '../editorial/editorial-profile.service';

@Controller('projects/:projectId/editorial-profile')
@UseGuards(SessionGuard)
export class EditorialProfileController {
  constructor(private readonly profiles: EditorialProfileService) {}
  @Get() get(@CurrentUser() user: User, @Param('projectId') projectId: string) {
    return this.profiles.get(user.id, projectId);
  }
  @Post('proposals') @HttpCode(202) propose(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() body: EditorialProfileProposalDto,
  ) {
    return this.profiles.propose(user.id, projectId, body.expectedVersion, {
      length: body.length,
      pedagogy: body.pedagogy,
      technicalFamiliarity: body.technicalFamiliarity,
      tone: body.tone,
      guidance: body.guidance ?? null,
    });
  }
  @Get('proposals/:proposalId') proposal(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('proposalId') proposalId: string,
  ) {
    return this.profiles.getProposal(user.id, projectId, proposalId);
  }
  @Post('proposals/:proposalId/cancel') cancel(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('proposalId') proposalId: string,
    @Body() body: EditorialProposalActionDto,
  ) {
    return this.profiles.cancel(
      user.id,
      projectId,
      proposalId,
      body.expectedVersion,
    );
  }
  @Post('proposals/:proposalId/confirm') @HttpCode(202) confirm(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('proposalId') proposalId: string,
    @Body() body: ConfirmEditorialProposalDto,
  ) {
    return this.profiles.confirm(
      user.id,
      projectId,
      proposalId,
      body.expectedVersion,
    );
  }
}
