import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { SourceRevisionService } from './source-revision.service';

export interface GuidedCorrectionInput {
  expectedSourceRevisionId: string;
  correctedContent: string;
  reason?: string;
}

@Injectable()
export class SourceCorrectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly revisions: SourceRevisionService,
  ) {}

  async correct(
    userId: string,
    projectId: string,
    informationItemId: string,
    input: GuidedCorrectionInput,
  ): Promise<{ status: 'completed'; revisionId: string }> {
    await this.access.requireContributor(userId, projectId);
    const source = await this.prisma.projectSource.findUnique({
      where: { projectId },
    });
    if (!source) {
      this.hideNotFound();
    }
    if (source.currentRevisionId !== input.expectedSourceRevisionId) {
      throw new ConflictException({ code: 'STALE_SOURCE_REVISION' });
    }
    const currentItem = await this.prisma.sourceRevisionItem.findFirst({
      where: {
        sourceRevisionId: source.currentRevisionId,
        informationItemId,
      },
      select: { informationItemId: true },
    });
    if (!currentItem) {
      this.hideNotFound();
    }

    const committed = await this.prisma.$transaction(async (tx) => {
      const assertion = await tx.contributorAssertion.create({
        data: {
          projectSourceId: source.id,
          authorUserId: userId,
          kind: 'guided_correction',
          targetInformationItemId: informationItemId,
          content: input.correctedContent.trim(),
          reason: input.reason?.trim() || undefined,
        },
      });
      return this.revisions.commitGuidedCorrection(tx, {
        projectId,
        projectSourceId: source.id,
        informationItemId,
        assertionId: assertion.id,
        correctedContent: input.correctedContent.trim(),
        expectedSourceRevisionId: input.expectedSourceRevisionId,
        userId,
      });
    });
    if (committed.status === 'stale') {
      throw new ConflictException({ code: 'STALE_SOURCE_REVISION' });
    }
    return { status: 'completed', revisionId: committed.revisionId };
  }

  private hideNotFound(): never {
    throw new NotFoundException({ code: 'NOT_FOUND' });
  }
}
