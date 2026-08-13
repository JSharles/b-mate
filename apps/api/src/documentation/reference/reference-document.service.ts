import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ReferenceDocument } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { GenerationService } from '../../generation/generation.service';
import {
  REFERENCE_DOCUMENT_OUTPUT_CONTRACT,
  REFERENCE_DOCUMENT_PROMPT_VERSION,
} from './reference-output.schema';
import { referenceFingerprint } from './reference-document.handler';

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

    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { id: true, activeReferenceDocumentId: true },
    });

    // One at a time. Checked here for a usable error, and refused again by the
    // unique constraint below if two callers get this far at once.
    if (project.activeReferenceDocumentId) {
      const held = await this.prisma.referenceDocument.findFirst({
        where: { id: project.activeReferenceDocumentId, status: 'writing' },
        select: { id: true },
      });
      if (held) throw new ConflictException({ code: 'REFERENCE_WRITING' });
    }

    // Written from the documents themselves and the developer's notes. No
    // canonical source between them any more.
    const [documents, notes] = await Promise.all([
      this.prisma.sourceDocument.findMany({
        where: { projectId, status: 'incorporated' },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      }),
      this.prisma.note.findMany({
        where: { projectId, archivedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      }),
    ]);
    if (documents.length === 0) {
      throw new BadRequestException({ code: 'NO_DOCUMENTS' });
    }

    const input = {
      locale: locale ?? FALLBACK_LOCALE,
      documentIds: documents.map((document) => document.id),
      noteIds: notes.map((note) => note.id),
    };
    const attempts = await this.prisma.referenceDocument.count({
      where: { projectId },
    });

    return this.prisma.$transaction(async (tx) => {
      const operation = await this.generation.createInTransaction(tx, {
        projectId,
        type: 'reference_document',
        deduplicationKey: `reference:${projectId}:${input.locale}:${attempts}`,
        inputFingerprint: referenceFingerprint(input),
        promptVersion: REFERENCE_DOCUMENT_PROMPT_VERSION,
        outputContractVersion: REFERENCE_DOCUMENT_OUTPUT_CONTRACT,
      });
      const document = await tx.referenceDocument.create({
        data: {
          projectId,
          generationOperationId: operation.id,
          locale: input.locale,
          status: 'writing',
        },
      });
      // Claiming the slot only from a project that holds none is what makes two
      // simultaneous triggers produce one document rather than two.
      const claimed = await tx.project.updateMany({
        where: { id: project.id, activeReferenceDocumentId: null },
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
    if (!document) return null;

    return this.toView(document);
  }

  // What the working page shows: a count and a way in, never a second list of
  // the points themselves (FR-016c).
  async summary(userId: string, projectId: string) {
    await this.access.requireContributor(userId, projectId);

    const [documentCount, noteCount, project, document] = await Promise.all([
      this.prisma.sourceDocument.count({
        where: { projectId, status: 'incorporated' },
      }),
      this.prisma.note.count({ where: { projectId, archivedAt: null } }),
      this.prisma.project.findUnique({
        where: { id: projectId },
        select: { referenceNeedsRewrite: true },
      }),
      this.current(userId, projectId),
    ]);

    return {
      documentCount,
      noteCount,
      openPointCount: document?.points.length ?? 0,
      needsRewrite: project?.referenceNeedsRewrite ?? true,
      document,
    };
  }

  // A note is what the developer told us that their documents do not say.
  // Answering a point and correcting a paragraph both land here (FR-012).
  async addNote(
    userId: string,
    projectId: string,
    input: { content: string; context?: string | null },
  ) {
    await this.access.requireContributor(userId, projectId);
    const note = await this.prisma.note.create({
      data: {
        projectId,
        content: input.content.trim(),
        context: input.context?.trim() || null,
        authorId: userId,
      },
      include: { author: { select: { firstName: true, lastName: true } } },
    });
    // The document is written from the documents and the notes, so a new note
    // owes a rewrite — it never triggers one (FR-006).
    await this.prisma.project.update({
      where: { id: projectId },
      data: { referenceNeedsRewrite: true },
    });
    return this.toNoteView(note);
  }

  async listNotes(userId: string, projectId: string) {
    await this.access.requireContributor(userId, projectId);
    const notes = await this.prisma.note.findMany({
      where: { projectId, archivedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { firstName: true, lastName: true } } },
    });
    return { notes: notes.map((note) => this.toNoteView(note)) };
  }

  async removeNote(userId: string, projectId: string, noteId: string) {
    await this.access.requireContributor(userId, projectId);
    const { count } = await this.prisma.note.updateMany({
      where: { id: noteId, projectId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    // Hidden rather than deleted: a note is attributable, and the document it
    // shaped stays explicable.
    if (count === 0) throw new NotFoundException({ code: 'NOT_FOUND' });
    await this.prisma.project.update({
      where: { id: projectId },
      data: { referenceNeedsRewrite: true },
    });
    return { removed: true as const };
  }

  private toNoteView(note: {
    id: string;
    content: string;
    context: string | null;
    createdAt: Date;
    author: { firstName: string; lastName: string };
  }) {
    return {
      id: note.id,
      content: note.content,
      context: note.context,
      authorName: `${note.author.firstName} ${note.author.lastName}`.trim(),
      createdAt: note.createdAt.toISOString(),
    };
  }

  private toView(document: ReferenceDocument) {
    return {
      id: document.id,
      status: document.status,
      outcome: document.outcome,
      locale: document.locale,
      // Parts stay empty until there is something to read, so a caller cannot
      // mistake "still writing" for "nothing usable".
      parts:
        document.status === 'ready'
          ? ((document.structuredContent ?? []) as unknown[])
          : [],
      points:
        document.status === 'ready'
          ? ((document.points ?? []) as { id: string }[])
          : [],
      unrelatedDocuments:
        document.status === 'ready'
          ? ((document.unrelatedDocuments ?? []) as string[])
          : [],
      failureCode: document.failureCode,
      createdAt: document.createdAt.toISOString(),
      version: document.version,
    };
  }
}
