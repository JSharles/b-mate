import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionGuard } from '../auth/session.guard';
import { CurrentTaskService } from './current-task.service';

@Controller('projects/:projectId/current-task')
@UseGuards(SessionGuard)
export class CurrentTaskController {
  constructor(private readonly currentTaskService: CurrentTaskService) {}

  @Get()
  findAll(@CurrentUser() user: User, @Param('projectId') projectId: string) {
    return this.currentTaskService.getCurrentTask(user.id, projectId);
  }
}
