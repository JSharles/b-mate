import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SourceDocument } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { NotionConnectionService } from '../../notion-connection/notion-connection.service';
import {
  NotionAccessError,
  NotionClient,
} from '../../notion-connection/notion.client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../../projects/project-access.service';
import { DocumentStorageClient } from './document-storage.client';
import {
  DocumentInputNormalizerService,
  type UploadDocumentInput,
} from './document-input-normalizer.service';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

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
  status: 'received' | 'incorporated' | 'failed' | 'removed';
  version: number;
  title: string;
  failureCode: string | null;
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
}

@Injectable()
export class SourceDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageClient,
    private readonly normalizer: DocumentInputNormalizerService,
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

    // Read once, here, so an unreadable file is refused at the door rather than
    // failing the whole reference write later — one bad upload must not be able
    // to take the project's document down with it.
    try {
      await this.normalizer.normalizeUpload({
        bytes: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype as UploadDocumentInput['mimeType'],
      });
    } catch {
      throw new BadRequestException(
        'This file could not be read. Check that it opens, then try again.',
      );
    }

    await this.storage.put(objectKey, file.buffer, file.mimetype);

    let document: SourceDocument | null = null;
    try {
      document = await this.prisma.sourceDocument.create({
        data: {
          id: documentId,
          projectId,
          kind: 'upload',
          status: 'incorporated',
          title: stripExtension(file.originalname),
          originalFileName: file.originalname,
          originalMimeType: file.mimetype,
          originalSizeBytes: file.size,
          storedObjectKey: objectKey,
          contentSha256,
          addedByUserId: userId,
        },
      });
      await this.oweRewrite(projectId);
      return { document: this.summary(document) };
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
          status: 'incorporated',
          title: page.title,
          originalMimeType: 'application/json',
          originalSizeBytes: snapshot.length,
          storedObjectKey: objectKey,
          externalUrl: pageUrl,
          contentSha256: sha256(snapshot),
          addedByUserId: userId,
        },
      });
      await this.oweRewrite(projectId);
      return { document: this.summary(document) };
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

  private summary(document: SourceDocument): SourceDocumentSummary {
    return {
      id: document.id,
      kind: document.kind,
      status: document.status,
      version: document.version,
      title: document.title,
      failureCode: document.failureCode,
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
          where: { id: documentId },
        }),
      );
    }
    await Promise.allSettled(operations);
  }

  // A document arriving or leaving changes what the next write will read, so
  // the reference document is owed a rewrite. It says so and waits (FR-006).
  private oweRewrite(projectId: string): Promise<unknown> {
    return this.prisma.project.update({
      where: { id: projectId },
      data: { referenceNeedsRewrite: true },
    });
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
