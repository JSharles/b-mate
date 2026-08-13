import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../auth/current-user.decorator';
import { SessionGuard } from '../../auth/session.guard';
import { ProjectAccessService } from '../../projects/project-access.service';
import { ClientPublicationService } from '../publication/client-publication.service';

@Controller('projects/:projectId')
@UseGuards(SessionGuard)
export class ClientContentController {
  constructor(
    private readonly access: ProjectAccessService,
    private readonly publication: ClientPublicationService,
  ) {}
  @Get('documentation/public-sections')
  async current(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
  ) {
    await this.access.requireMember(user.id, projectId);
    return this.publication.readPublicSections(projectId);
  }
  @Get('documentation/client-content')
  async preview(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
  ) {
    await this.access.requireContributor(user.id, projectId);
    return this.publication.readPreview(projectId);
  }
}
