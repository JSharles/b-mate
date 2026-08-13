import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import type { ReferenceDocument } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { GenerationService } from '../../generation/generation.service';
import {
  REFERENCE_DOCUMENT_OUTPUT_CONTRACT,
  REFERENCE_DOCUMENT_PROMPT_VERSION,
} from './reference-output.schema';
import {
  referenceFingerprint,
  selectReferenceStatements,
} from './reference-document.handler';

const FALLBACK_LOCALE = 'en';

@Injectable()
export class ReferenceDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly generation: GenerationService,
  ) {}

  async write(userId: string, projectId: string, locale: string | null) {
    await this.access.requireContributor(userId, projectId);

    const source = await this.prisma.projectSource.findUnique({
      where: { projectId },
      select: {
        id: true,
        currentRevisionId: true,
        activeReferenceDocumentId: true,
      },
    });
    if (!source?.currentRevisionId) {
      throw new BadRequestException({ code: 'NO_CANONICAL_CONTENT' });
    }

    // One at a time. Checked here for a usable error, and refused again by the
    // unique constraint below if two callers get this far at once.
    if (source.activeReferenceDocumentId) {
      const held = await this.prisma.referenceDocument.findFirst({
        where: { id: source.activeReferenceDocumentId, status: 'writing' },
        select: { id: true },
      });
      if (held) throw new ConflictException({ code: 'REFERENCE_WRITING' });
    }

    const items = await this.prisma.sourceRevisionItem.findMany({
      where: { sourceRevisionId: source.currentRevisionId },
      orderBy: { sortOrder: 'asc' },
    });
    if (items.length === 0) {
      throw new BadRequestException({ code: 'NO_CANONICAL_CONTENT' });
    }

    const input = {
      locale: locale ?? FALLBACK_LOCALE,
      sourceRevisionId: source.currentRevisionId,
      statements: selectReferenceStatements(items),
    };
    const attempts = await this.prisma.referenceDocument.count({
      where: { projectId },
    });

    return this.prisma.$transaction(async (tx) => {
      const operation = await this.generation.createInTransaction(tx, {
        projectId,
        type: 'reference_document',
        deduplicationKey: `reference:${projectId}:${source.currentRevisionId}:${input.locale}:${attempts}`,
        inputFingerprint: referenceFingerprint(input),
        promptVersion: REFERENCE_DOCUMENT_PROMPT_VERSION,
        outputContractVersion: REFERENCE_DOCUMENT_OUTPUT_CONTRACT,
        sourceRevisionId: source.currentRevisionId!,
      });
      const document = await tx.referenceDocument.create({
        data: {
          projectId,
          sourceRevisionId: source.currentRevisionId!,
          generationOperationId: operation.id,
          locale: input.locale,
          status: 'writing',
        },
      });
      // Claiming the slot only from a source that holds none is what makes two
      // simultaneous triggers produce one document rather than two.
      const claimed = await tx.projectSource.updateMany({
        where: { id: source.id, activeReferenceDocumentId: null },
        data: { activeReferenceDocumentId: document.id },
      });
      if (claimed.count !== 1) {
        throw new ConflictException({ code: 'REFERENCE_WRITING' });
      }
      return { documentId: document.id, operationId: operation.id };
    });
  }

  async current(userId: string, projectId: string) {
    await this.access.requireContributor(userId, projectId);
    const document = await this.prisma.referenceDocument.findFirst({
      where: { projectId, status: { in: ['ready', 'writing', 'failed'] } },
      orderBy: { createdAt: 'desc' },
    });
    return document ? this.toView(document) : null;
  }

  // What the working page shows instead of a hundred rows.
  async summary(userId: string, projectId: string) {
    await this.access.requireContributor(userId, projectId);

    const source = await this.prisma.projectSource.findUnique({
      where: { projectId },
      select: {
        currentRevisionId: true,
        referenceNeedsRewrite: true,
        currentRevision: { select: { createdAt: true } },
      },
    });

    const [statementCount, openPointCount, documentCount, document] =
      await Promise.all([
        source?.currentRevisionId
          ? this.prisma.sourceRevisionItem.count({
              where: { sourceRevisionId: source.currentRevisionId },
            })
          : 0,
        source?.currentRevisionId
          ? this.prisma.sourceRevisionItem.count({
              where: {
                sourceRevisionId: source.currentRevisionId,
                state: 'point_to_clarify',
              },
            })
          : 0,
        this.prisma.sourceDocument.count({
          where: { projectId, status: 'incorporated' },
        }),
        this.current(userId, projectId),
      ]);

    return {
      statementCount,
      documentCount,
      openPointCount,
      sourceRevisionId: source?.currentRevisionId ?? null,
      lastChangedAt: source?.currentRevision?.createdAt?.toISOString() ?? null,
      needsRewrite: source?.referenceNeedsRewrite ?? true,
      document,
    };
  }

  private toView(document: ReferenceDocument) {
    return {
      id: document.id,
      sourceRevisionId: document.sourceRevisionId,
      status: document.status,
      outcome: document.outcome,
      locale: document.locale,
      // Parts stay empty until there is something to read, so a caller cannot
      // mistake "still writing" for "nothing usable".
      parts:
        document.status === 'ready'
          ? ((document.structuredContent ?? []) as unknown[])
          : [],
      failureCode: document.failureCode,
      createdAt: document.createdAt.toISOString(),
      version: document.version,
    };
  }
}
