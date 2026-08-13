import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { ReferenceDocumentService } from '../reference/reference-document.service';
import { DocumentStorageClient } from './document-storage.client';

// Removing a document used to mean rebuilding a fact base around the hole it
// left — a preview counting which statements it alone supported, a pending
// state, a sweep for removals abandoned halfway. None of that survives the
// reference document: every write reads the documents that are there, so
// removing one is removing one. What is left is the warning that the reference
// document will no longer say what this document said (specs/018).
@Injectable()
export class DocumentRemovalService {
  private readonly logger = new Logger(DocumentRemovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly storage: DocumentStorageClient,
    private readonly reference: ReferenceDocumentService,
  ) {}

  async preview(userId: string, projectId: string, documentId: string) {
    await this.access.requireContributor(userId, projectId);
    const document = await this.prisma.sourceDocument.findFirst({
      where: { id: documentId, projectId, status: { not: 'removed' } },
      select: { id: true, version: true, title: true },
    });
    if (!document) throw new NotFoundException({ code: 'NOT_FOUND' });

    // How many documents would remain. Removing the last one leaves a project
    // that can no longer write a reference document at all, which the
    // contributor should know before confirming rather than after.
    const remainingDocumentCount = await this.prisma.sourceDocument.count({
      where: { projectId, status: 'incorporated', id: { not: documentId } },
    });
    const referenceExists = await this.prisma.referenceDocument.count({
      where: { projectId, status: 'ready' },
    });

    return {
      documentId,
      documentVersion: document.version,
      title: document.title,
      remainingDocumentCount,
      referenceNeedsRewrite: referenceExists > 0,
    };
  }

  async confirm(
    userId: string,
    projectId: string,
    documentId: string,
    input: { expectedDocumentVersion: number },
    locale: string | null = null,
  ) {
    await this.access.requireContributor(userId, projectId);

    // Claimed at the version the contributor was shown, so a document that
    // moved under the confirmation is refused rather than removed on a
    // decision taken about something else.
    const { count } = await this.prisma.sourceDocument.updateMany({
      where: {
        id: documentId,
        projectId,
        version: input.expectedDocumentVersion,
        status: { not: 'removed' },
      },
      data: {
        status: 'removed',
        removedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (count !== 1) throw new ConflictException({ code: 'STALE_REMOVAL' });

    // What the corpus holds changed, so the reference document is rewritten —
    // the same rule as adding one. The document already written stays readable
    // until the new one is ready, so the client-facing sections composed
    // against it never read a gap.
    await this.prisma.project.update({
      where: { id: projectId },
      data: { referenceNeedsRewrite: true },
    });
    try {
      await this.reference.write(userId, projectId, locale);
    } catch (error) {
      // Removing the last document leaves nothing to write from, and a write
      // already running has this removal behind it. Neither is a reason to
      // refuse the removal: the document is gone either way.
      if (
        !(error instanceof ConflictException) &&
        !(error instanceof BadRequestException)
      ) {
        throw error;
      }
    }

    // The row is what makes the document gone; the bytes are cleanup. A failure
    // here leaves an orphaned object, not a document the contributor removed
    // and still sees.
    const document = await this.prisma.sourceDocument.findUnique({
      where: { id: documentId },
      select: { storedObjectKey: true },
    });
    if (document?.storedObjectKey) {
      try {
        await this.storage.delete(document.storedObjectKey);
      } catch (error) {
        this.logger.warn(
          `Could not delete stored object for document ${documentId}: ${String(error)}`,
        );
      }
    }

    return { documentId, removed: true as const };
  }
}
