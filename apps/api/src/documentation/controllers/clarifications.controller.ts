import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../auth/current-user.decorator';
import { SessionGuard } from '../../auth/session.guard';
import {
  ClarificationQueryDto,
  ResolveClarificationsDto,
} from '../dto/clarification.dto';
import { ClarificationService } from '../source/clarification.service';

@Controller('projects/:projectId/documentation/clarifications')
@UseGuards(SessionGuard)
export class ClarificationsController {
  constructor(private readonly clarifications: ClarificationService) {}

  @Get()
  list(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Query('status') status?: ClarificationQueryDto['status'],
    @Query('cursor') cursor?: string,
  ) {
    return this.clarifications.list(user.id, projectId, { status, cursor });
  }

  @Post('resolutions')
  @HttpCode(202)
  resolve(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() body: ResolveClarificationsDto,
  ) {
    return this.clarifications.resolve(user.id, projectId, body);
  }
}
