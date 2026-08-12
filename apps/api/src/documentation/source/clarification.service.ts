import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ClarificationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { ResolveClarificationsDto } from '../dto/clarification.dto';
import { SourceRevisionService } from './source-revision.service';

@Injectable()
export class ClarificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly revisions: SourceRevisionService,
  ) {}

  async list(
    userId: string,
    projectId: string,
    options: {
      status?: ClarificationStatus;
      cursor?: string;
    },
  ) {
    await this.access.requireContributor(userId, projectId);
    const source = await this.prisma.projectSource.findUnique({
      where: { projectId },
    });
    if (!source) return { items: [], total: 0, nextCursor: null };
    const where: Prisma.ClarificationWhereInput = {
      projectSourceId: source.id,
      ...(options.status ? { status: options.status } : {}),
    };
    const pageSize = 50;
    const [total, rows] = await Promise.all([
      this.prisma.clarification.count({ where }),
      this.prisma.clarification.findMany({
        where,
        include: {
          items: true,
          evidence: {
            include: {
              documentObservation: { include: { sourceDocument: true } },
              contributorAssertion: { include: { authorUser: true } },
            },
          },
        },
        orderBy: [{ impactRank: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        take: pageSize + 1,
        ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      }),
    ]);
    const hasMore = rows.length > pageSize;
    const page = rows.slice(0, pageSize);
    return {
      items: page.map((row) => ({
        id: row.id,
        question: row.question,
        impactRank: row.impactRank,
        impactExplanation: row.impactExplanation,
        status: row.status,
        version: row.version,
        detectedInRevisionId: row.detectedInRevisionId,
        informationItemIds: row.items.map(
          ({ informationItemId }) => informationItemId,
        ),
        openPointBlockId: row.id,
        evidence: row.evidence.map((evidence) => {
          if (evidence.documentObservation) {
            return {
              kind: 'document' as const,
              originId: evidence.documentObservationId!,
              label: evidence.documentObservation.sourceDocument.title,
              excerpt: evidence.documentObservation.originalExcerpt,
              locator: evidence.documentObservation.locator,
            };
          }
          const assertion = evidence.contributorAssertion;
          if (!assertion)
            throw new Error('Clarification evidence has no origin.');
          return {
            kind: 'contributor' as const,
            originId: assertion.id,
            label:
              `${assertion.authorUser.firstName} ${assertion.authorUser.lastName}`.trim(),
            excerpt: assertion.content,
            locator: null,
          };
        }),
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async resolve(
    userId: string,
    projectId: string,
    input: ResolveClarificationsDto,
  ) {
    await this.access.requireContributor(userId, projectId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "project_sources" WHERE "project_id" = ${projectId}::uuid FOR UPDATE`;
      const source = await tx.projectSource.findUnique({
        where: { projectId },
      });
      if (!source) throw new NotFoundException({ code: 'NOT_FOUND' });
      if (source.currentRevisionId !== input.expectedSourceRevisionId) {
        throw new ConflictException({ code: 'SOURCE_REVISION_STALE' });
      }
      const requestedIds = input.resolutions.map(
        ({ clarificationId }) => clarificationId,
      );
      if (new Set(requestedIds).size !== requestedIds.length) {
        throw new ConflictException({ code: 'DUPLICATE_CLARIFICATION' });
      }
      const rows = await tx.clarification.findMany({
        where: { id: { in: requestedIds }, projectSourceId: source.id },
        include: { items: true },
      });
      const byId = new Map(rows.map((row) => [row.id, row]));
      for (const resolution of input.resolutions) {
        const row = byId.get(resolution.clarificationId);
        if (
          !row ||
          !['open', 'left_open'].includes(row.status) ||
          row.version !== resolution.expectedVersion
        ) {
          throw new ConflictException({ code: 'CLARIFICATION_STALE' });
        }
      }

      const answers: Array<{
        clarificationId: string;
        assertionId: string;
        informationItemIds: string[];
        content: string;
      }> = [];
      const assertionByClarification = new Map<string, string>();
      for (const resolution of input.resolutions) {
        if (resolution.action !== 'answer') continue;
        const row = byId.get(resolution.clarificationId)!;
        const assertion = await tx.contributorAssertion.create({
          data: {
            projectSourceId: source.id,
            authorUserId: userId,
            kind: 'clarification_answer',
            content: resolution.answer!,
          },
        });
        assertionByClarification.set(row.id, assertion.id);
        answers.push({
          clarificationId: row.id,
          assertionId: assertion.id,
          informationItemIds: row.items.map(
            ({ informationItemId }) => informationItemId,
          ),
          content: resolution.answer!,
        });
      }
      const committed = answers.length
        ? await this.revisions.commitClarificationAnswers(tx, {
            projectId,
            projectSourceId: source.id,
            expectedSourceRevisionId: input.expectedSourceRevisionId,
            userId,
            answers,
          })
        : null;
      if (committed?.status === 'stale') {
        throw new ConflictException({ code: 'SOURCE_REVISION_STALE' });
      }
      const revisionId =
        committed && 'revisionId' in committed ? committed.revisionId : null;
      const items: Array<{
        clarificationId: string;
        status: 'answered' | 'left_open';
        version: number;
        openPointBlockId: string;
      }> = [];
      for (const resolution of input.resolutions) {
        const nextStatus: 'answered' | 'left_open' =
          resolution.action === 'answer' ? 'answered' : 'left_open';
        await tx.clarification.update({
          where: { id: resolution.clarificationId },
          data: {
            status: nextStatus,
            version: { increment: 1 },
            ...(revisionId && resolution.action === 'answer'
              ? { resolvedInRevisionId: revisionId }
              : {}),
          },
        });
        await tx.clarificationResolution.create({
          data: {
            clarificationId: resolution.clarificationId,
            kind: resolution.action,
            answerAssertionId: assertionByClarification.get(
              resolution.clarificationId,
            ),
            resolvedByUserId: userId,
            expectedClarificationVersion: resolution.expectedVersion,
          },
        });
        items.push({
          clarificationId: resolution.clarificationId,
          status: nextStatus,
          version: resolution.expectedVersion + 1,
          openPointBlockId: resolution.clarificationId,
        });
      }
      return { items, sourceRevisionId: revisionId };
    });
  }
}
