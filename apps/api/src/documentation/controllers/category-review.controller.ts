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
import { CorrectDraftDto, ReviewDraftDto } from '../dto/category-review.dto';
import { CategoryReviewService } from '../review/category-review.service';

@Controller('projects/:projectId/documentation/category-drafts')
@UseGuards(SessionGuard)
export class CategoryReviewController {
  constructor(private readonly reviews: CategoryReviewService) {}
  @Get() list(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
  ) {
    return this.reviews.list(user.id, projectId);
  }
  @Get(':draftId') detail(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('draftId') draftId: string,
  ) {
    return this.reviews.detail(user.id, projectId, draftId);
  }
  @Post(':draftId/accept') @HttpCode(202) accept(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('draftId') draftId: string,
    @Body() body: ReviewDraftDto,
  ) {
    return this.reviews.accept(
      user.id,
      projectId,
      draftId,
      body.expectedVersion,
    );
  }
  @Post(':draftId/discard') @HttpCode(202) discard(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('draftId') draftId: string,
    @Body() body: ReviewDraftDto,
  ) {
    return this.reviews.discard(
      user.id,
      projectId,
      draftId,
      body.expectedVersion,
    );
  }
  @Post(':draftId/correct') @HttpCode(202) correct(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('draftId') draftId: string,
    @Body() body: CorrectDraftDto,
  ) {
    return this.reviews.correct(
      user.id,
      projectId,
      draftId,
      body.expectedVersion,
      body.instruction,
    );
  }
}
