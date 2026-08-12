import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  GenerationOperation,
  GenerationOperationType,
  SourceDocument,
  SourceDocumentStatus,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import {
  GenerationService,
  TERMINAL_OPERATION_STATUSES,
} from '../../generation/generation.service';
import { NotionConnectionService } from '../../notion-connection/notion-connection.service';
import {
  NotionAccessError,
  NotionClient,
} from '../../notion-connection/notion.client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { DOCUMENT_EXTRACTION_OUTPUT_CONTRACT } from './prompts/extraction.prompt';
import { DOCUMENT_EXTRACTION_PROMPT_VERSION } from './extraction-output.schema';
import { DocumentStorageClient } from './document-storage.client';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

// The statuses in which a document is being worked on by the pipeline and has
// not yet reached the canonical source. A contributor can walk away from any of
// them: nothing downstream has been written yet, so there is nothing to unwind.
const PROCESSING_STATUSES = [
  'received',
  'extracting',
  'ready_to_consolidate',
  'incorporating',
  'retrying',
] as const satisfies readonly SourceDocumentStatus[];

// Why a cancelled document sits in `failed`: the two are the same situation for
// everything downstream — work stopped short of the canonical source — and the
// removal path already handles it. The code is what tells them apart, so the
// interface can say "cancelled" rather than accusing the document of failing.
export const CANCELLED_BY_CONTRIBUTOR = 'CANCELLED_BY_CONTRIBUTOR';

// Where a restarted document has to stand for the stage to pick it up again.
// Every restart used to set `retrying`, which only extraction accepts: a
// restarted consolidation was refused by its own handler with "document is no
// longer current", twice, and went straight back to needs_attention.
const RESUME_STATUS_BY_STAGE: Partial<
  Record<GenerationOperationType, SourceDocumentStatus>
> = {
  document_extraction: 'retrying',
  source_consolidation: 'ready_to_consolidate',
};
const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;
const HIDDEN_NOT_FOUND = { code: 'NOT_FOUND' } as const;
const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
]);

export interface SourceDocumentSummary {
  id: string;
  kind: 'upload' | 'notion';
  status: SourceDocumentStatus;
  version: number;
  title: string;
  failureCode: string | null;
  incorporatedInRevisionId: string | null;
  processingStartedAt: string;
  createdAt: string;
}

export interface SourceDocumentDetail extends SourceDocumentSummary {
  originalFileName: string | null;
  originalMimeType: string | null;
  originalSizeBytes: number | null;
  originalDownloadUrl: string | null;
  externalUrl: string | null;
}

export interface SourceDocumentAcknowledgement {
  document: SourceDocumentSummary;
  operation: {
    operationId: string;
    status: 'queued' | 'running' | 'waiting_provider' | 'retry_scheduled';
  };
}

@Injectable()
export class SourceDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageClient,
    private readonly generation: GenerationService,
    private readonly access: ProjectAccessService,
    private readonly notionClient: NotionClient,
    private readonly notionConnection: NotionConnectionService,
  ) {}

  async addUpload(
    userId: string,
    projectId: string,
    file: Express.Multer.File,
  ): Promise<SourceDocumentAcknowledgement> {
    await this.access.requireContributor(userId, projectId);
    this.validateUpload(file);

    const documentId = randomUUID();
    const objectKey = this.uploadObjectKey(
      projectId,
      documentId,
      file.originalname,
    );
    const contentSha256 = sha256(file.buffer);
    await this.storage.put(objectKey, file.buffer, file.mimetype);

    let document: SourceDocument | null = null;
    try {
      document = await this.prisma.sourceDocument.create({
        data: {
          id: documentId,
          projectId,
          kind: 'upload',
          status: 'received',
          processingStartedAt: new Date(),
          title: stripExtension(file.originalname),
          originalFileName: file.originalname,
          originalMimeType: file.mimetype,
          originalSizeBytes: file.size,
          storedObjectKey: objectKey,
          contentSha256,
          addedByUserId: userId,
        },
      });
      const operation = await this.createExtractionOperation(document);
      return this.acknowledgement(document, operation);
    } catch (error) {
      await this.compensateCreate(document?.id, objectKey);
      throw error;
    }
  }

  async addNotion(
    userId: string,
    projectId: string,
    pageUrl: string,
  ): Promise<SourceDocumentAcknowledgement> {
    await this.access.requireContributor(userId, projectId);
    const pageId = parseNotionPageId(pageUrl);
    if (!pageId) {
      throw new BadRequestException('Invalid Notion page URL.');
    }
    const token = await this.notionConnection.getDecryptedToken(projectId);
    if (!token) {
      throw new BadRequestException(
        'Connect a Notion integration for this project first.',
      );
    }

    let page: { title: string; content: string };
    try {
      page = await this.notionClient.fetchPage(token, pageId);
    } catch (error) {
      if (error instanceof NotionAccessError) {
        throw new BadRequestException(
          'Unable to access this Notion page with the connected integration.',
        );
      }
      throw error;
    }

    const documentId = randomUUID();
    const snapshot = Buffer.from(
      JSON.stringify({
        version: 1,
        capturedAt: new Date().toISOString(),
        pageId,
        pageUrl,
        title: page.title,
        content: page.content,
      }),
      'utf8',
    );
    const objectKey = `documentation/${projectId}/${documentId}/notion-snapshot.json`;
    await this.storage.put(objectKey, snapshot, 'application/json');

    let document: SourceDocument | null = null;
    try {
      document = await this.prisma.sourceDocument.create({
        data: {
          id: documentId,
          projectId,
          kind: 'notion',
          status: 'received',
          processingStartedAt: new Date(),
          title: page.title,
          originalMimeType: 'application/json',
          originalSizeBytes: snapshot.length,
          storedObjectKey: objectKey,
          externalUrl: pageUrl,
          contentSha256: sha256(snapshot),
          addedByUserId: userId,
        },
      });
      const operation = await this.createExtractionOperation(document);
      return this.acknowledgement(document, operation);
    } catch (error) {
      await this.compensateCreate(document?.id, objectKey);
      throw error;
    }
  }

  async list(
    userId: string,
    projectId: string,
    cursor?: string,
  ): Promise<{
    items: SourceDocumentSummary[];
    total: number;
    nextCursor: string | null;
  }> {
    await this.access.requireContributor(userId, projectId);
    const pageSize = 50;
    const total = await this.prisma.sourceDocument.count({
      where: { projectId, status: { not: 'removed' } },
    });
    const documents = await this.prisma.sourceDocument.findMany({
      where: { projectId, status: { not: 'removed' } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pageSize + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = documents.length > pageSize;
    const page = documents.slice(0, pageSize);
    return {
      items: page.map((document) => this.summary(document)),
      total,
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async detail(
    userId: string,
    projectId: string,
    documentId: string,
  ): Promise<SourceDocumentDetail> {
    await this.access.requireContributor(userId, projectId);
    const document = await this.prisma.sourceDocument.findFirst({
      where: { id: documentId, projectId },
    });
    if (!document) {
      throw new NotFoundException(HIDDEN_NOT_FOUND);
    }
    const originalDownloadUrl =
      document.storedObjectKey && document.status !== 'removed'
        ? await this.storage.getDownloadUrl(
            document.storedObjectKey,
            DOWNLOAD_URL_TTL_SECONDS,
          )
        : null;
    return {
      ...this.summary(document),
      originalFileName: document.originalFileName,
      originalMimeType: document.originalMimeType,
      originalSizeBytes: document.originalSizeBytes,
      originalDownloadUrl,
      externalUrl: document.externalUrl,
    };
  }

  // A document being worked on offered no way out: no stop, no delete, only a
  // spinner. A batch stage runs for minutes and can hang for hours, so that
  // left a contributor with a row they could neither finish nor get rid of.
  async cancelProcessing(
    userId: string,
    projectId: string,
    documentId: string,
  ): Promise<{ cancelledOperationCount: number }> {
    await this.access.requireContributor(userId, projectId);
    const document = await this.prisma.sourceDocument.findFirst({
      where: {
        id: documentId,
        projectId,
        status: { in: [...PROCESSING_STATUSES] },
      },
      include: {
        generationOperations: {
          where: {
            status: {
              in: ['queued', 'running', 'waiting_provider', 'retry_scheduled'],
            },
          },
          select: { id: true },
        },
      },
    });
    if (!document) {
      throw new NotFoundException(HIDDEN_NOT_FOUND);
    }

    // Stop the remote work first. If the document were released before its
    // operations were, an in-flight result could still land on it and drag it
    // back into the pipeline the contributor just walked away from.
    let cancelledOperationCount = 0;
    for (const operation of document.generationOperations) {
      const { cancelled } = await this.generation.cancel(operation.id);
      if (cancelled) cancelledOperationCount += 1;
    }

    const claimed = await this.prisma.sourceDocument.updateMany({
      where: { id: documentId, projectId, version: document.version },
      data: {
        status: 'failed',
        failureCode: CANCELLED_BY_CONTRIBUTOR,
        version: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      throw new NotFoundException(HIDDEN_NOT_FOUND);
    }
    return { cancelledOperationCount };
  }

  async retryProcessing(
    userId: string,
    projectId: string,
    documentId: string,
  ): Promise<{ operationId: string; status: string }> {
    await this.access.requireContributor(userId, projectId);
    const document = await this.prisma.sourceDocument.findFirst({
      where: { id: documentId, projectId, status: 'failed' },
      include: {
        generationOperations: {
          // Whichever stage stopped, not the first one. Restricted to
          // extraction, this restarted a stage that had already succeeded when
          // it was the consolidation that had stopped — and since that older
          // extraction had already been re-run once, the retry resolved to the
          // finished operation and queued nothing at all. The document was
          // then marked "retrying" with no work behind it, which nothing
          // recovers from.
          //
          // A cancelled stage is as re-runnable as a failed one: changing your
          // mind after stopping should not mean re-uploading the document.
          where: { status: { in: ['needs_attention', 'cancelled'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    const failedOperation = document?.generationOperations.at(0);
    if (!document || !failedOperation) {
      throw new NotFoundException(HIDDEN_NOT_FOUND);
    }

    const replacement = await this.generation.retry(failedOperation.id);
    // A replacement that is already over is not a restart. Announcing one
    // anyway is what left the document in `retrying` with nothing running: the
    // interface said "processing restarted", the row spun, and no work existed
    // behind it.
    if (
      !replacement ||
      TERMINAL_OPERATION_STATUSES.includes(replacement.status)
    ) {
      throw new NotFoundException(HIDDEN_NOT_FOUND);
    }
    await this.prisma.sourceDocument.updateMany({
      where: { id: documentId, projectId, status: 'failed' },
      data: {
        status: RESUME_STATUS_BY_STAGE[failedOperation.type] ?? 'retrying',
        failureCode: null,
        // A restart is a new run. Without this the row kept counting from the
        // day the document was added: "processing for 10 hours" one second
        // after the contributor restarted it.
        processingStartedAt: new Date(),
        version: { increment: 1 },
      },
    });
    return { operationId: replacement.id, status: replacement.status };
  }

  private validateUpload(file: Express.Multer.File): void {
    if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Unsupported file type. Accepted formats: PDF, Word (.docx), PNG, JPEG.',
      );
    }
    if (file.size <= 0 || file.buffer.length === 0) {
      throw new BadRequestException('The uploaded document is empty.');
    }
    if (
      file.size > MAX_FILE_SIZE_BYTES ||
      file.buffer.length > MAX_FILE_SIZE_BYTES
    ) {
      throw new BadRequestException('File is too large. Maximum size: 25 MB.');
    }
  }

  private createExtractionOperation(
    document: SourceDocument,
  ): Promise<GenerationOperation> {
    if (!document.contentSha256) {
      throw new Error('A source document cannot be extracted without a hash.');
    }
    return this.generation.create({
      projectId: document.projectId,
      type: 'document_extraction',
      deduplicationKey: `document-extraction:${document.id}:v${document.version}:${document.contentSha256}`,
      inputFingerprint: document.contentSha256,
      promptVersion: DOCUMENT_EXTRACTION_PROMPT_VERSION,
      outputContractVersion: DOCUMENT_EXTRACTION_OUTPUT_CONTRACT,
      sourceDocumentId: document.id,
    });
  }

  private acknowledgement(
    document: SourceDocument,
    operation: GenerationOperation,
  ): SourceDocumentAcknowledgement {
    if (
      operation.status !== 'queued' &&
      operation.status !== 'running' &&
      operation.status !== 'waiting_provider' &&
      operation.status !== 'retry_scheduled'
    ) {
      throw new Error('A new document must reference an active operation.');
    }
    return {
      document: this.summary(document),
      operation: { operationId: operation.id, status: operation.status },
    };
  }

  private summary(document: SourceDocument): SourceDocumentSummary {
    return {
      id: document.id,
      kind: document.kind,
      status: document.status,
      version: document.version,
      title: document.title,
      failureCode: document.failureCode,
      incorporatedInRevisionId: document.incorporatedInRevisionId,
      // The run in progress, not the document's whole life. Falling back to
      // createdAt covers the first run, where the two are the same.
      processingStartedAt: (
        document.processingStartedAt ?? document.createdAt
      ).toISOString(),
      createdAt: document.createdAt.toISOString(),
    };
  }

  private async compensateCreate(
    documentId: string | undefined,
    objectKey: string,
  ): Promise<void> {
    const operations: Promise<unknown>[] = [this.storage.delete(objectKey)];
    if (documentId) {
      operations.unshift(
        this.prisma.sourceDocument.deleteMany({
          where: { id: documentId, status: 'received' },
        }),
      );
    }
    await Promise.allSettled(operations);
  }

  private uploadObjectKey(
    projectId: string,
    documentId: string,
    originalName: string,
  ): string {
    const safeName = originalName
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9._-]+/gu, '-')
      .replace(/^-+|-+$/gu, '')
      .slice(0, 180);
    return `documentation/${projectId}/${documentId}/${safeName || 'original'}`;
  }
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function stripExtension(fileName: string): string {
  const stripped = fileName.replace(/\.[^.]+$/u, '').trim();
  return stripped || 'Untitled document';
}

export function parseNotionPageId(pageUrl: string): string | null {
  try {
    const url = new URL(pageUrl);
    if (url.protocol !== 'https:' || !isOfficialNotionHostname(url.hostname)) {
      return null;
    }
    const compact = url.pathname.replaceAll('-', '');
    return compact.match(/([0-9a-f]{32})\/?$/iu)?.[1] ?? null;
  } catch {
    return null;
  }
}

function isOfficialNotionHostname(hostname: string): boolean {
  return ['notion.so', 'notion.com'].some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  );
}
