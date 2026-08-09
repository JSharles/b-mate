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
import { ResourceStorageClient } from './resource-storage.client';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

// Short-lived — regenerated on every read, never persisted or cached
// beyond the current response (research.md Decision 6).
const PRESIGNED_URL_TTL_SECONDS = 15 * 60;

export interface ResourceCategoryResponse {
  id: string;
  categoryId: string;
  key: string;
  label: string;
  status: 'proposed' | 'approved' | 'rejected';
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
  vulgarizedTitle: string | null;
  vulgarizedContent: string | null;
  failureReason: string | null;
  publishedAt: string | null;
  createdAt: string;
  categories: ResourceCategoryResponse[];
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

    await this.storageClient.uploadFile(fileKey, file.buffer, file.mimetype);

    const source = toVulgarizationSource(kind, file.buffer);
    const existingCategories = await this.findExistingCategories(projectId);
    const anthropicBatchId = await this.documentVulgarizationClient.submitBatch(
      source,
      title,
      existingCategories,
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

    const existingCategories = await this.findExistingCategories(projectId);
    const anthropicBatchId = await this.documentVulgarizationClient.submitBatch(
      { kind: 'text', text: page.content },
      page.title,
      existingCategories,
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
  // sees only published ones. List items never carry vulgarized
  // content/file URLs (title alone is enough for a tile) — findOne() below
  // populates those for a resource's own detail page.
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
        this.toResponse(resource, locale, false, membership.role),
      ),
    );
  }

  // FR-010, spec.md Edge Cases: a client requesting a non-published
  // resource gets the exact same 404 as a resource that never existed —
  // never a distinct "exists but not published yet."
  async findOne(
    userId: string,
    projectId: string,
    resourceId: string,
    locale: Locale,
  ): Promise<ResourceResponse> {
    const membership = await this.assertIsMember(userId, projectId);

    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
    });

    if (!resource || resource.projectId !== projectId) {
      throw new NotFoundException('Resource not found');
    }
    if (membership.role === 'client' && resource.status !== 'published') {
      throw new NotFoundException('Resource not found');
    }

    return this.toResponse(resource, locale, true, membership.role);
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

    return this.prisma.resource.update({
      where: { id: resourceId },
      data: {
        status: 'published',
        publishedAt: new Date(),
        publishedByUserId: userId,
      },
    });
  }

  // specs/013-ai-resource-categorization FR-004: each proposed category is
  // approved/rejected individually, independent of the resource's own
  // publish() — approving/rejecting one assignment never touches the
  // resource's other assignments or its own status.
  async approveCategory(
    userId: string,
    projectId: string,
    resourceId: string,
    assignmentId: string,
  ): Promise<void> {
    await this.setCategoryAssignmentStatus(
      userId,
      projectId,
      resourceId,
      assignmentId,
      'approved',
    );
  }

  async rejectCategory(
    userId: string,
    projectId: string,
    resourceId: string,
    assignmentId: string,
  ): Promise<void> {
    await this.setCategoryAssignmentStatus(
      userId,
      projectId,
      resourceId,
      assignmentId,
      'rejected',
    );
  }

  private async setCategoryAssignmentStatus(
    userId: string,
    projectId: string,
    resourceId: string,
    assignmentId: string,
    status: 'approved' | 'rejected',
  ): Promise<void> {
    await this.assertIsContributor(userId, projectId);

    const assignment = await this.prisma.resourceCategoryAssignment.findUnique({
      where: { id: assignmentId },
    });
    // Never confirms whether the assignment exists at all if it doesn't
    // belong to this resource/project — same "not found" shape regardless
    // of which check actually failed (Constitution V).
    if (
      !assignment ||
      assignment.resourceId !== resourceId ||
      (
        await this.prisma.resource.findUnique({
          where: { id: resourceId },
        })
      )?.projectId !== projectId
    ) {
      throw new NotFoundException('Category assignment not found');
    }
    // One-way: proposed -> approved | rejected only (data-model.md). An
    // already-decided assignment can't be re-decided in this iteration.
    if (assignment.status !== 'proposed') {
      throw new ConflictException(
        'This category has already been approved or rejected',
      );
    }

    await this.prisma.resourceCategoryAssignment.update({
      where: { id: assignmentId },
      data: { status },
    });
  }

  // research.md Decision 2: read before submitting a new resource's batch,
  // so the category-detection prompt can reuse an existing key instead of
  // minting a near-duplicate.
  private async findExistingCategories(
    projectId: string,
  ): Promise<{ key: string; labelEn: string }[]> {
    const categories = await this.prisma.resourceCategory.findMany({
      where: { projectId },
    });
    return categories.map((c) => ({ key: c.key, labelEn: c.labelEn }));
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
    includeDetails: boolean,
    role: ProjectMember['role'],
  ): Promise<ResourceResponse> {
    let vulgarizedTitle: string | null = null;
    let vulgarizedContent: string | null = null;
    let originalFileUrl: string | null = null;

    if (includeDetails) {
      const vulgarization = await this.prisma.resourceVulgarization.findUnique({
        where: { resourceId_locale: { resourceId: resource.id, locale } },
      });
      vulgarizedTitle = vulgarization?.title ?? null;
      vulgarizedContent = vulgarization?.content ?? null;

      if (resource.source === 'upload' && resource.originalFileKey) {
        originalFileUrl = await this.storageClient.getPresignedDownloadUrl(
          resource.originalFileKey,
          PRESIGNED_URL_TTL_SECONDS,
        );
      }
    }

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
      vulgarizedTitle,
      vulgarizedContent,
      failureReason: resource.failureReason,
      publishedAt: resource.publishedAt?.toISOString() ?? null,
      createdAt: resource.createdAt.toISOString(),
      categories: await this.categoriesFor(resource.id, locale, role),
    };
  }

  // Fetched for both the list and detail views (unlike vulgarizedTitle/
  // Content, which stay detail-only) — the client-facing tabbed grouping
  // (specs/013-ai-resource-categorization FR-005) is built from the list
  // endpoint, so it needs every resource's categories there too. A client
  // only ever receives 'approved' assignments — mirrors how findAllForProject
  // already restricts which resources reach them at all (FR-002).
  private async categoriesFor(
    resourceId: string,
    locale: Locale,
    role: ProjectMember['role'],
  ): Promise<ResourceCategoryResponse[]> {
    const assignments = await this.prisma.resourceCategoryAssignment.findMany({
      where: {
        resourceId,
        ...(role === 'client' ? { status: 'approved' } : {}),
      },
      include: { category: true },
    });

    return assignments.map((assignment) => ({
      id: assignment.id,
      categoryId: assignment.categoryId,
      key: assignment.category.key,
      label:
        locale === 'fr'
          ? assignment.category.labelFr
          : assignment.category.labelEn,
      status: assignment.status,
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

function toVulgarizationSource(
  kind: 'pdf' | 'docx' | 'image/png' | 'image/jpeg',
  fileBuffer: Buffer,
): DocumentVulgarizationSource {
  switch (kind) {
    case 'pdf':
      return { kind: 'pdf', fileBuffer };
    case 'docx':
      return { kind: 'docx', fileBuffer };
    case 'image/png':
      return { kind: 'image', fileBuffer, mimeType: 'image/png' };
    case 'image/jpeg':
      return { kind: 'image', fileBuffer, mimeType: 'image/jpeg' };
  }
}
