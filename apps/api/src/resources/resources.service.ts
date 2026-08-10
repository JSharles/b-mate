import {
  BadRequestException,
  ConflictException,
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
import { Locale } from '../task-vulgarization/locale';
import {
  DocumentVulgarizationClient,
  DocumentVulgarizationSource,
} from './document-vulgarization.client';
import {
  ImageNormalizationError,
  ImageNormalizer,
  NormalizableImageMimeType,
} from './image-normalizer';
import { ResourceCategoryKey } from './resource-categories';
import { ResourceStorageClient } from './resource-storage.client';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

// Short-lived — regenerated on every read, never persisted or cached
// beyond the current response (research.md Decision 6).
const PRESIGNED_URL_TTL_SECONDS = 15 * 60;

export interface ResourceSectionResponse {
  id: string;
  categoryKey: ResourceCategoryKey;
  status: 'proposed' | 'approved' | 'rejected';
  title: string;
  content: string;
}

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
  publishedAt: string | null;
  createdAt: string;
  sections: ResourceSectionResponse[];
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
    private readonly documentVulgarizationClient: DocumentVulgarizationClient,
    private readonly imageNormalizer: ImageNormalizer,
    private readonly notionClient: NotionClient,
    private readonly notionConnectionService: NotionConnectionService,
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

    const source = await this.buildVulgarizationSource(kind, file.buffer);
    const anthropicBatchId = await this.documentVulgarizationClient.submitBatch(
      source,
      title,
    );

    return this.prisma.resource.create({
      data: {
        projectId,
        source: 'upload',
        status: 'processing',
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

    const anthropicBatchId = await this.documentVulgarizationClient.submitBatch(
      { kind: 'text', text: page.content },
      page.title,
    );

    return this.prisma.resource.create({
      data: {
        projectId,
        source: 'notion',
        status: 'processing',
        title: page.title,
        notionPageUrl: pageUrl,
        addedByUserId: userId,
        anthropicBatchId,
      },
    });
  }

  // FR-005/FR-010: a contributor sees every resource (including
  // processing/ready_for_review/failed, so they can manage them); a client
  // sees only published ones.
  //
  // specs/014-category-sections FR-019: list items now carry their sections
  // in full, content included. The old list/detail split — where the list
  // returned titles only — is exactly what forced a client to click into a
  // document to read anything.
  async findAllForProject(
    userId: string,
    projectId: string,
    locale: Locale,
  ): Promise<ResourceResponse[]> {
    const membership = await this.assertIsMember(userId, projectId);

    const resources = await this.prisma.resource.findMany({
      where: {
        projectId,
        ...(membership.role === 'client' ? { status: 'published' } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      resources.map((resource) =>
        this.toResponse(resource, locale, membership.role),
      ),
    );
  }

  // specs/014-category-sections Q2: this endpoint now backs the contributor's
  // review screen and nothing else — a client reads everything inline under
  // the category tabs, from the list endpoint. A client-role member therefore
  // gets the same 404 a non-member gets, whatever the resource's status, and
  // never a distinguishable "exists but forbidden" (Constitution V).
  async findOne(
    userId: string,
    projectId: string,
    resourceId: string,
    locale: Locale,
  ): Promise<ResourceResponse> {
    const membership = await this.assertIsContributor(userId, projectId);

    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
    });

    if (!resource || resource.projectId !== projectId) {
      throw new NotFoundException('Resource not found');
    }

    return this.toResponse(resource, locale, membership.role);
  }

  // FR-016: a distinct, explicit developer action — never automatic on
  // processing completion. Only valid from ready_for_review; publishing an
  // already-published, still-processing, or failed resource is rejected.
  async publish(
    userId: string,
    projectId: string,
    resourceId: string,
  ): Promise<Resource> {
    await this.assertIsContributor(userId, projectId);

    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
    });
    if (!resource || resource.projectId !== projectId) {
      throw new NotFoundException('Resource not found');
    }
    if (resource.status !== 'ready_for_review') {
      throw new BadRequestException(
        'Only a resource ready for review can be published',
      );
    }

    // specs/014-category-sections research.md Decision 4. Publishing a
    // resource whose sections are all still proposed or rejected would give
    // the client nothing — FR-018 hides categories with no approved section,
    // so it would be `published` yet contribute to no tab at all. That state
    // is indistinguishable from a bug for both roles.
    const approvedCount = await this.prisma.resourceSection.count({
      where: { resourceId, status: 'approved' },
    });
    if (approvedCount === 0) {
      throw new BadRequestException(
        'Approve at least one section before publishing — otherwise the client sees nothing.',
      );
    }

    return this.prisma.resource.update({
      where: { id: resourceId },
      data: {
        status: 'published',
        publishedAt: new Date(),
        publishedByUserId: userId,
      },
    });
  }

  // specs/014-category-sections FR-013/FR-014. What a contributor now reviews
  // is not a *label* — the category list is fixed, so there is nothing to
  // approve about it — but what the analysis actually filed where. Each
  // section is decided on its own, and none of these actions touches the
  // resource's own status.
  async approveSection(
    userId: string,
    projectId: string,
    resourceId: string,
    sectionId: string,
  ): Promise<void> {
    const section = await this.findProposedSection(
      userId,
      projectId,
      resourceId,
      sectionId,
    );
    await this.prisma.resourceSection.update({
      where: { id: section.id },
      data: { status: 'approved' },
    });
  }

  async rejectSection(
    userId: string,
    projectId: string,
    resourceId: string,
    sectionId: string,
  ): Promise<void> {
    const section = await this.findProposedSection(
      userId,
      projectId,
      resourceId,
      sectionId,
    );
    await this.prisma.resourceSection.update({
      where: { id: section.id },
      data: { status: 'rejected' },
    });
  }

  // FR-015: re-filing a mis-categorized section changes its category and
  // nothing else. Restricted to a still-proposed section (research.md
  // Decision 4) — moving one after approval would silently pull it out of a
  // tab a client is already reading.
  async moveSection(
    userId: string,
    projectId: string,
    resourceId: string,
    sectionId: string,
    categoryKey: ResourceCategoryKey,
  ): Promise<void> {
    const section = await this.findProposedSection(
      userId,
      projectId,
      resourceId,
      sectionId,
    );

    if (section.categoryKey === categoryKey) {
      return;
    }

    // The unique (resourceId, categoryKey) pair means the target may already
    // be taken. Refused rather than merged: concatenating two independently
    // written rewrites produces incoherent prose (spec.md Assumptions), and
    // the contributor can reject one and move the other.
    const occupant = await this.prisma.resourceSection.findUnique({
      where: {
        resourceId_categoryKey: { resourceId, categoryKey },
      },
    });
    if (occupant) {
      throw new ConflictException(
        'This document already has a section in that category',
      );
    }

    await this.prisma.resourceSection.update({
      where: { id: section.id },
      data: { categoryKey },
    });
  }

  // Collapses "no such section", "section belongs to another resource",
  // "resource belongs to another project" and "caller is not a contributor"
  // into one indistinguishable response — never confirms existence to someone
  // who shouldn't know (Constitution V).
  private async findProposedSection(
    userId: string,
    projectId: string,
    resourceId: string,
    sectionId: string,
  ) {
    await this.assertIsContributor(userId, projectId);

    const section = await this.prisma.resourceSection.findUnique({
      where: { id: sectionId },
    });
    if (
      !section ||
      section.resourceId !== resourceId ||
      (
        await this.prisma.resource.findUnique({
          where: { id: resourceId },
        })
      )?.projectId !== projectId
    ) {
      throw new NotFoundException('Section not found');
    }
    // One-way: proposed -> approved | rejected (data-model.md). An
    // already-decided section can't be re-decided in this iteration.
    if (section.status !== 'proposed') {
      throw new ConflictException(
        'This section has already been approved or rejected',
      );
    }

    return section;
  }

  // specs/014-category-sections research.md Decision 6: an image goes through
  // normalization before analysis, because the provider rejects anything over
  // 8000 px on its long edge — and does so per-request at execution time, so
  // an un-normalized oversized image produces a resource that is created
  // successfully and only fails minutes later, with an opaque batch error.
  // pdf/docx/text have no such ceiling and pass straight through.
  private async buildVulgarizationSource(
    kind: 'pdf' | 'docx' | 'image/png' | 'image/jpeg',
    fileBuffer: Buffer,
  ): Promise<DocumentVulgarizationSource> {
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

    if (resource.source === 'upload' && resource.originalFileKey) {
      await this.storageClient.deleteFile(resource.originalFileKey);
    }

    await this.prisma.resource.delete({ where: { id: resourceId } });
  }

  private async toResponse(
    resource: Resource,
    locale: Locale,
    role: ProjectMember['role'],
  ): Promise<ResourceResponse> {
    // No more list/detail split: one shape, every field populated, whichever
    // endpoint asked. Presigning is a local signature over the request, not a
    // round trip to storage, so doing it per row in a list costs nothing
    // measurable — and it is what lets an accordion block offer the source
    // document without a second call (FR-020).
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
      publishedAt: resource.publishedAt?.toISOString() ?? null,
      createdAt: resource.createdAt.toISOString(),
      sections: await this.sectionsFor(resource.id, locale, role),
    };
  }

  // Resolves one locale's pair out of the stored en/fr columns, the same way
  // 013 resolved labelEn/labelFr. A client only ever receives 'approved'
  // sections (FR-016) — mirrors the status filter findAllForProject already
  // applies to the resources themselves.
  //
  // Ordered by `position` so several sections of one document keep the order
  // the analysis produced them in (FR-022).
  private async sectionsFor(
    resourceId: string,
    locale: Locale,
    role: ProjectMember['role'],
  ): Promise<ResourceSectionResponse[]> {
    const sections = await this.prisma.resourceSection.findMany({
      where: {
        resourceId,
        ...(role === 'client' ? { status: 'approved' } : {}),
      },
      orderBy: { position: 'asc' },
    });

    return sections.map((section) => ({
      id: section.id,
      categoryKey: section.categoryKey,
      status: section.status,
      title: locale === 'fr' ? section.titleFr : section.titleEn,
      content: locale === 'fr' ? section.contentFr : section.contentEn,
    }));
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
