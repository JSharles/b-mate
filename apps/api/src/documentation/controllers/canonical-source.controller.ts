import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../auth/current-user.decorator';
import { SessionGuard } from '../../auth/session.guard';
import { SourceRevisionService } from '../source/source-revision.service';
import { SourceCorrectionService } from '../source/source-correction.service';
import { SourceLanguageService } from '../source/source-language.service';
import {
  ConfirmLanguageProposalDto,
  CreateLanguageProposalDto,
  GuidedCorrectionDto,
} from '../dto/canonical-source.dto';

@Controller('projects/:projectId/documentation/source')
@UseGuards(SessionGuard)
export class CanonicalSourceController {
  constructor(
    private readonly revisionsService: SourceRevisionService,
    private readonly corrections: SourceCorrectionService,
    private readonly languages: SourceLanguageService,
  ) {}

  @Get()
  read(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Query('revisionId') revisionId?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.revisionsService.readSource(user.id, projectId, {
      revisionId,
      cursor,
    });
  }

  @Get('revisions')
  revisions(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.revisionsService.listRevisions(user.id, projectId, cursor);
  }

  @Get('items/:itemId/provenance')
  provenance(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
    @Query('revisionId') revisionId?: string,
  ) {
    return this.revisionsService.readProvenance(
      user.id,
      projectId,
      itemId,
      revisionId,
    );
  }

  @Post('items/:itemId/corrections')
  correct(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('itemId') itemId: string,
    @Body() body: GuidedCorrectionDto,
  ) {
    return this.corrections.correct(user.id, projectId, itemId, body);
  }

  @Post('language-proposals')
  proposeLanguage(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() body: CreateLanguageProposalDto,
  ) {
    return this.languages.propose(user.id, projectId, body);
  }

  @Post('language-proposals/:proposalId/confirm')
  confirmLanguage(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('proposalId') proposalId: string,
    @Body() body: ConfirmLanguageProposalDto,
  ) {
    return this.languages.confirm(user.id, projectId, proposalId, body);
  }
}
