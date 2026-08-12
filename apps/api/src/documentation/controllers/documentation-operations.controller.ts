import {
  Controller,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../auth/current-user.decorator';
import { SessionGuard } from '../../auth/session.guard';
import { GenerationService } from '../../generation/generation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { CategoryProjectionService } from '../review/category-projection.service';

@Controller('projects/:projectId/documentation/operations')
@UseGuards(SessionGuard)
export class DocumentationOperationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly generation: GenerationService,
    private readonly projections: CategoryProjectionService,
  ) {}
  @Post(':operationId/retry')
  @HttpCode(202)
  async retry(
    @CurrentUser() user: User,
    @Param('projectId') projectId: string,
    @Param('operationId') operationId: string,
  ) {
    await this.access.requireContributor(user.id, projectId);
    const operation = await this.prisma.generationOperation.findFirst({
      where: { id: operationId, projectId, status: 'needs_attention' },
      select: { id: true, type: true },
    });
    if (!operation) throw new NotFoundException({ code: 'NOT_FOUND' });

    // A category draft is owned by its category, not by the operation that
    // happened to produce it. Re-running the operation made a second one with
    // no draft behind it, which could only fail — so this stage retries through
    // the projection, which knows which category and which revision are due.
    if (operation.type === 'factual_drafting') {
      const draftId = await this.projections.retryDraft(
        projectId,
        operation.id,
      );
      if (!draftId) throw new NotFoundException({ code: 'NOT_FOUND' });
      return { draftId, status: 'generating', actionCode: 'RETRY_QUEUED' };
    }

    const replacement = await this.generation.retry(operation.id);
    if (!replacement) throw new NotFoundException({ code: 'NOT_FOUND' });
    return {
      operationId: replacement.id,
      status: replacement.status,
      actionCode: 'RETRY_QUEUED',
    };
  }
}
