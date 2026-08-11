import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../auth/current-user.decorator';
import { SessionGuard } from '../../auth/session.guard';
import { DocumentationWorkspaceService } from '../workspace/documentation-workspace.service';

@Controller('projects/:projectId/documentation')
@UseGuards(SessionGuard)
export class DocumentationWorkspaceController {
  constructor(private readonly workspace: DocumentationWorkspaceService) {}
  @Get()
  get(@CurrentUser() user: User, @Param('projectId') projectId: string) {
    return this.workspace.get(user.id, projectId);
  }
}
