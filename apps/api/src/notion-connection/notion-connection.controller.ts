import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionGuard } from '../auth/session.guard';
import { CreateNotionConnectionDto } from './dto/create-notion-connection.dto';
import { NotionConnectionService } from './notion-connection.service';

@Controller('projects/:projectId/notion-connection')
@UseGuards(SessionGuard)
export class NotionConnectionController {
  constructor(
    private readonly notionConnectionService: NotionConnectionService,
  ) {}

  @Get()
  findOne(@CurrentUser() user: User, @Param('projectId') projectId: string) {
    return this.notionConnectionService.findForProject(user.id, projectId);
  }

  @Post()
  connect(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() dto: CreateNotionConnectionDto,
  ) {
    return this.notionConnectionService.connect(user.id, projectId, dto.token);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  disconnect(@CurrentUser() user: User, @Param('projectId') projectId: string) {
    return this.notionConnectionService.disconnect(user.id, projectId);
  }
}
