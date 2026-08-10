import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProjectMember, Resource } from '@prisma/client';
import { randomUUID } from 'crypto';
import { NotionConnectionService } from '../notion-connection/notion-connection.service';
import {
  NotionAccessError,
  NotionClient,
} from '../notion-connection/notion.client';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryReferenceService } from './category-reference.service';
import {
  DocumentSource,
  ExistingReference,
  ReferenceAnalysisClient,
} from './reference-analysis.client';
import {
  ImageNormalizationError,
  ImageNormalizer,
  NormalizableImageMimeType,
} from './image-normalizer';
import { ResourceStorageClient } from './resource-storage.client';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

// Short-lived — regenerated on every read, never persisted or cached
// beyond the current response (research.md Decision 6).
const PRESIGNED_URL_TTL_SECONDS = 15 * 60;

export interface ResourceResponse {
  id: string;
  projectId: string;
  source: Resource['source'];
  status: Resource['status'];
  title: string;
  originalFileUrl: string | null;
  originalFileName: string | null;
  originalFileMimeType: string | null;
  notionPageUrl: string | null;
  failureReason: string | null;
  createdAt: string;
}

const ACCEPTED_MIME_TYPES: Record<
  string,
  'pdf' | 'docx' | 'image/png' | 'image/jpeg'
> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
};

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageClient: ResourceStorageClient,
    private readonly referenceAnalysisClient: ReferenceAnalysisClient,
    private readonly imageNormalizer: ImageNormalizer,
    private readonly notionClient: NotionClient,
    private readonly notionConnectionService: NotionConnectionService,
    private readonly categoryReferenceService: CategoryReferenceService,
  ) {}

  // FR-001, FR-013, FR-015: validates the file, stores the original in R2,
  // creates the resource immediately in "processing" state, and submits AI
  // processing (research.md Decision 4) — the developer is never blocked
  // waiting for vulgarization to finish.
  async createFromUpload(
    userId: string,
    projectId: string,
    file: Express.Multer.File,
  ): Promise<Resource> {
    await this.assertIsContributor(userId, projectId);

    const kind = ACCEPTED_MIME_TYPES[file.mimetype];
    if (!kind) {
      throw new BadRequestException(
        'Unsupported file type. Accepted formats: PDF, Word (.docx), PNG, JPEG.',
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException('File is too large. Maximum size: 25 MB.');
    }

    const title = stripExtension(file.originalname);
    const fileKey = `resources/${projectId}/${randomUUID()}-${file.originalname}`;

    // The *original* is what gets stored and what a reader downloads later —
    // normalization below only ever shapes the copy handed to analysis.
    await this.storageClient.uploadFile(fileKey, file.buffer, file.mimetype);

    const source = await this.buildDocumentSource(kind, file.buffer);
    const anthropicBatchId = await this.referenceAnalysisClient.submitIngestion(
      source,
      title,
      await this.existingReference(projectId),
    );

    return this.prisma.resource.create({
      data: {
        projectId,
        source: 'upload',
        status: 'pending',
        title,
        originalFileKey: fileKey,
        originalFileName: file.originalname,
        originalFileMimeType: file.mimetype,
        originalFileSizeBytes: file.size,
        addedByUserId: userId,
        anthropicBatchId,
      },
    });
  }

  // spec.md US4, FR-015: same immediate-"processing", async-AI lifecycle
  // as createFromUpload — the developer isn't blocked waiting for the
  // Notion fetch+vulgarization to finish.
  //
  // specs/012-project-settings: connecting the Notion integration is now a
  // standalone action (Settings, `NotionConnectionService.connect()`) — this
  // method only ever reuses the project's already-stored token, resolved via
  // that service (cross-module DI, not a Prisma reach-in — Constitution III).
  async createFromNotion(
    userId: string,
    projectId: string,
    pageUrl: string,
  ): Promise<Resource> {
    await this.assertIsContributor(userId, projectId);

    const pageId = parseNotionPageId(pageUrl);
    if (!pageId) {
      throw new BadRequestException('Invalid Notion page URL.');
    }

    const token =
      await this.notionConnectionService.getDecryptedToken(projectId);
    if (!token) {
      throw new BadRequestException(
        'Connect a Notion integration for this project first, from Settings.',
      );
    }

    let page: { title: string; content: string };
    try {
      page = await this.notionClient.fetchPage(token, pageId);
    } catch (error) {
      if (error instanceof NotionAccessError) {
        throw new BadRequestException(
          'Unable to access this Notion page. Check that the connected integration has access to it.',
        );
      }
      throw error;
    }

    const anthropicBatchId = await this.referenceAnalysisClient.submitIngestion(
      { kind: 'text', text: page.content },
      page.title,
      await this.existingReference(projectId),
    );

    return this.prisma.resource.create({
      data: {
        projectId,
        source: 'notion',
        status: 'pending',
        title: page.title,
        notionPageUrl: pageUrl,
        addedByUserId: userId,
        anthropicBatchId,
      },
    });
  }

  // specs/015 Q3/FR-019a: documents are inputs, never something a client
  // reads — what a client reads is category content. So this list is
  // contributor-only, and a client gets the same response a non-member would.
  async findAllForProject(
    userId: string,
    projectId: string,
  ): Promise<ResourceResponse[]> {
    await this.assertIsContributor(userId, projectId);

    const resources = await this.prisma.resource.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(resources.map((resource) => this.toResponse(resource)));
  }

  // Contributor-only, same reasoning as the list above: a client has no
  // business looking at a document, and gets the response a non-member gets
  // rather than a distinguishable "exists but forbidden" (Constitution V).
  async findOne(
    userId: string,
    projectId: string,
    resourceId: string,
  ): Promise<ResourceResponse> {
    await this.assertIsContributor(userId, projectId);

    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
    });

    if (!resource || resource.projectId !== projectId) {
      throw new NotFoundException('Resource not found');
    }

    return this.toResponse(resource);
  }

  // specs/014-category-sections research.md Decision 6: an image goes through
  // normalization before analysis, because the provider rejects anything over
  // 8000 px on its long edge — and does so per-request at execution time, so
  // an un-normalized oversized image produces a resource that is created
  // successfully and only fails minutes later, with an opaque batch error.
  // pdf/docx/text have no such ceiling and pass straight through.
  private async buildDocumentSource(
    kind: 'pdf' | 'docx' | 'image/png' | 'image/jpeg',
    fileBuffer: Buffer,
  ): Promise<DocumentSource> {
    if (kind === 'pdf') {
      return { kind: 'pdf', fileBuffer };
    }
    if (kind === 'docx') {
      return { kind: 'docx', fileBuffer };
    }

    let normalized: { buffer: Buffer; mimeType: NormalizableImageMimeType };
    try {
      normalized = await this.imageNormalizer.normalize(fileBuffer, kind);
    } catch (error) {
      // FR-025: a file we can't process is refused at upload time, in plain
      // language, rather than becoming a resource that fails minutes later.
      if (error instanceof ImageNormalizationError) {
        throw new BadRequestException(
          'This image could not be read. It may be corrupt or incomplete.',
        );
      }
      throw error;
    }

    return {
      kind: 'image',
      fileBuffer: normalized.buffer,
      mimeType: normalized.mimeType,
    };
  }

  // FR-014: allowed from any state — deleting a published resource
  // immediately removes it from the client's view too (it simply no
  // longer exists). No edit/replace in this iteration; removing and
  // re-adding covers that case.
  async delete(
    userId: string,
    projectId: string,
    resourceId: string,
  ): Promise<void> {
    await this.assertIsContributor(userId, projectId);

    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
    });
    if (!resource || resource.projectId !== projectId) {
      throw new NotFoundException('Resource not found');
    }

    // FR-019: removing a document is the same operation as adding one, run
    // backwards — the categories it fed are rebuilt from the extracts that
    // survive it. Which categories those are has to be read *before* the
    // delete, since the cascade takes the extracts with the resource.
    const fedCategories = await this.prisma.categoryExtract.findMany({
      where: { resourceId },
      select: { categoryKey: true },
    });

    if (resource.source === 'upload' && resource.originalFileKey) {
      await this.storageClient.deleteFile(resource.originalFileKey);
    }

    await this.prisma.resource.delete({ where: { id: resourceId } });

    // Sequential on purpose: each rebuild submits a batch request, and a
    // document spanning several categories would otherwise fire them all at
    // once for no gain — the sweep collects them minutes later either way.
    for (const { categoryKey } of fedCategories) {
      await this.categoryReferenceService.rebuild(
        projectId,
        categoryKey,
        null,
        'document_removed',
      );
    }
  }

  private async toResponse(resource: Resource): Promise<ResourceResponse> {
    // Presigning is a local signature over the request, not a round trip to
    // storage, so doing it per row in a list costs nothing measurable.
    const originalFileUrl =
      resource.source === 'upload' && resource.originalFileKey
        ? await this.storageClient.getPresignedDownloadUrl(
            resource.originalFileKey,
            PRESIGNED_URL_TTL_SECONDS,
          )
        : null;

    return {
      id: resource.id,
      projectId: resource.projectId,
      source: resource.source,
      status: resource.status,
      title: resource.title,
      originalFileUrl,
      originalFileName: resource.originalFileName,
      originalFileMimeType: resource.originalFileMimeType,
      notionPageUrl: resource.notionPageUrl,
      failureReason: resource.failureReason,
      createdAt: resource.createdAt.toISOString(),
    };
  }

  // The reference layer as it stands, handed to the analysis so it produces
  // the *next* version rather than a second document alongside it (FR-004).
  private async existingReference(
    projectId: string,
  ): Promise<ExistingReference> {
    const references = await this.prisma.categoryReference.findMany({
      where: { projectId },
    });

    return Object.fromEntries(
      references.map((reference) => [reference.categoryKey, reference.content]),
    );
  }

  // Mirrors BoardConnectionsService/CurrentTaskService's own membership
  // checks — kept as a separate copy per Constitution III (Feature
  // Isolation). A client-role member gets the exact same response as a
  // non-member (FR-009) — never a distinct "forbidden."
  private async assertIsContributor(
    userId: string,
    projectId: string,
  ): Promise<ProjectMember> {
    const membership = await this.assertIsMember(userId, projectId);
    if (membership.role !== 'contributor') {
      throw new NotFoundException('Project not found');
    }
    return membership;
  }

  // Unlike assertIsContributor, open to any project member — used by the
  // read paths (FR-010: both roles can view resources, just different
  // subsets).
  private async assertIsMember(
    userId: string,
    projectId: string,
  ): Promise<ProjectMember> {
    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    if (!membership) {
      throw new NotFoundException('Project not found');
    }

    return membership;
  }
}

function stripExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.slice(0, lastDot) : filename;
}

// A Notion page's ID is always the trailing 32 hex characters of its URL's
// last path segment (Notion inserts dashes into some canonical URLs, none
// into others) — stripping dashes and taking the last 32 characters handles
// both forms, as well as a developer pasting the raw ID instead of a URL.
function parseNotionPageId(pageUrl: string): string | null {
  let candidate = pageUrl.trim();

  try {
    const url = new URL(candidate);
    const segments = url.pathname.split('/').filter(Boolean);
    candidate = segments[segments.length - 1] ?? '';
  } catch {
    // Not a URL — treat the whole input as a raw page ID.
  }

  const compact = candidate.replace(/-/g, '');
  const idPortion = compact.slice(-32);
  if (!/^[a-f0-9]{32}$/i.test(idPortion)) {
    return null;
  }

  return [
    idPortion.slice(0, 8),
    idPortion.slice(8, 12),
    idPortion.slice(12, 16),
    idPortion.slice(16, 20),
    idPortion.slice(20, 32),
  ].join('-');
}
