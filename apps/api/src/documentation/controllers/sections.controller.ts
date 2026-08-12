import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../auth/current-user.decorator';
import { SessionGuard } from '../../auth/session.guard';
import {
  CreateClientSectionDto,
  ReorderClientSectionsDto,
  UpdateClientSectionDto,
} from '../dto/client-section.dto';
import { ApproveSectionProposalDto } from '../dto/client-section.dto';
import { SectionProposalService } from '../composition/section-proposal.service';
import { ClientSectionService } from '../sections/client-section.service';

@Controller('projects/:projectId/documentation/sections')
@UseGuards(SessionGuard)
export class SectionsController {
  constructor(
    private readonly sections: ClientSectionService,
    private readonly proposals: SectionProposalService,
  ) {}

  @Get()
  list(@CurrentUser() user: User, @Param('projectId') projectId: string) {
    return this.sections.list(user.id, projectId);
  }

  @Post()
  create(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() body: CreateClientSectionDto,
  ) {
    return this.sections.create(user.id, projectId, body);
  }

  // Ahead of `:sectionId` so an ordering request is never read as a section
  // whose id happens to be "order".
  @Post('order')
  reorder(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() body: ReorderClientSectionsDto,
  ) {
    return this.sections.reorder(user.id, projectId, body);
  }

  @Patch(':sectionId')
  update(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('sectionId') sectionId: string,
    @Body() body: UpdateClientSectionDto,
  ) {
    return this.sections.update(user.id, projectId, sectionId, body);
  }

  @Delete(':sectionId')
  archive(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('sectionId') sectionId: string,
  ) {
    return this.sections.archive(user.id, projectId, sectionId);
  }

  @Post(':sectionId/composition')
  @HttpCode(202)
  compose(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('sectionId') sectionId: string,
  ) {
    return this.proposals.compose(user.id, projectId, sectionId);
  }

  @Get(':sectionId/proposal')
  proposal(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('sectionId') sectionId: string,
  ) {
    return this.proposals.current(user.id, projectId, sectionId);
  }

  @Post(':sectionId/proposal/approve')
  @HttpCode(202)
  approve(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('sectionId') sectionId: string,
    @Body() body: ApproveSectionProposalDto,
  ) {
    return this.proposals.approve(
      user.id,
      projectId,
      sectionId,
      body.expectedVersion,
    );
  }
}
