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
import { BoardConnectionsService } from './board-connections.service';
import { CreateBoardConnectionDto } from './dto/create-board-connection.dto';
import { PreviewBoardConnectionDto } from './dto/preview-board-connection.dto';

@Controller('projects/:projectId/board-connection')
@UseGuards(SessionGuard)
export class BoardConnectionsController {
  constructor(
    private readonly boardConnectionsService: BoardConnectionsService,
  ) {}

  @Get()
  findOne(@CurrentUser() user: User, @Param('projectId') projectId: string) {
    return this.boardConnectionsService.findForProject(user.id, projectId);
  }

  @Post('preview')
  preview(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() dto: PreviewBoardConnectionDto,
  ) {
    return this.boardConnectionsService.preview(user.id, projectId, dto);
  }

  @Post()
  connect(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Body() dto: CreateBoardConnectionDto,
  ) {
    return this.boardConnectionsService.connect(user.id, projectId, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  disconnect(@CurrentUser() user: User, @Param('projectId') projectId: string) {
    return this.boardConnectionsService.disconnect(user.id, projectId);
  }
}
