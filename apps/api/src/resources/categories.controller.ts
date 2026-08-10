import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionGuard } from '../auth/session.guard';
import { parseLocale } from '../task-vulgarization/locale';
import { CategoryContentService } from './category-content.service';
import { CategoryReferenceService } from './category-reference.service';
import { AnswerQuestionsDto } from './dto/answer-questions.dto';
import { RegenerateDraftDto } from './dto/regenerate-draft.dto';
// `import type`: with isolatedModules + emitDecoratorMetadata, a
// value-imported type in a decorated signature is a TS1272.
import type { ResourceCategoryKey } from './resource-categories';

// specs/015 contracts/reference-review.md. Content is now addressed by project
// and category, not by document — which is why it gets its own controller
// rather than hanging off the resources one.
@Controller('projects/:projectId/categories')
@UseGuards(SessionGuard)
export class CategoriesController {
  constructor(
    private readonly categoryReferenceService: CategoryReferenceService,
    private readonly categoryContentService: CategoryContentService,
  ) {}

  // The one surface a client has. Both roles read it.
  @Get('content')
  findContent(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Query('locale') locale: string | undefined,
  ) {
    return this.categoryContentService.findForProject(
      user.id,
      projectId,
      parseLocale(locale),
    );
  }

  @Get('drafts')
  listDrafts(@CurrentUser() user: User, @Param('projectId') projectId: string) {
    return this.categoryReferenceService.listDrafts(user.id, projectId);
  }

  @Post(':categoryKey/draft/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  accept(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('categoryKey') categoryKey: ResourceCategoryKey,
  ) {
    return this.categoryReferenceService.accept(
      user.id,
      projectId,
      categoryKey,
    );
  }

  @Post(':categoryKey/draft/discard')
  @HttpCode(HttpStatus.NO_CONTENT)
  discard(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('categoryKey') categoryKey: ResourceCategoryKey,
  ) {
    return this.categoryReferenceService.discard(
      user.id,
      projectId,
      categoryKey,
    );
  }

  // 202, not 204: the rebuild is asynchronous — a new draft replaces this one
  // when the analysis lands.
  @Post(':categoryKey/draft/regenerate')
  @HttpCode(HttpStatus.ACCEPTED)
  regenerate(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('categoryKey') categoryKey: ResourceCategoryKey,
    @Body() body: RegenerateDraftDto,
  ) {
    return this.categoryReferenceService.regenerate(
      user.id,
      projectId,
      categoryKey,
      body.instruction,
    );
  }

  // 202 for the same reason as regeneration: the answers feed the next
  // rebuild, they do not edit the draft in place. There is deliberately no
  // "skip" counterpart — accepting a draft with questions outstanding is
  // already the skip, and it leaves the open points marked in the text.
  @Post(':categoryKey/draft/answer')
  @HttpCode(HttpStatus.ACCEPTED)
  answerQuestions(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('categoryKey') categoryKey: ResourceCategoryKey,
    @Body() body: AnswerQuestionsDto,
  ) {
    return this.categoryReferenceService.answerQuestions(
      user.id,
      projectId,
      categoryKey,
      body.answers,
    );
  }
}
