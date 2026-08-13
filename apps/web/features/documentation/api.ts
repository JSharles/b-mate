import type {
  CanonicalSourcePage,
  DocumentAcknowledgement,
  GuidedCorrectionRequest,
  ItemProvenance,
  SourceDocument,
  SourceDocumentDetail,
  SourceRevisionSummary,
  Clarification,
  ResolveClarificationsRequest,
  ResolveClarificationsResponse,
  ClientContentPreview,
  DocumentationWorkspace,
  ConfirmDocumentRemoval,
  DocumentRemovalPreview,
  PublicClientSection,
  CreateSectionRequest,
  SectionProposalDetail,
  SectionView,
  UpdateSectionRequest,
} from "schemas";
import { ApiError, apiFetch } from "@/shared/lib/api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface CursorPage<T> {
  items: T[];
  total: number;
  nextCursor: string | null;
}

export interface CanonicalSourceOptions {
  revisionId?: string;
  cursor?: string;
}

export interface ClarificationOptions {
  status?: "open" | "left_open" | "answered" | "superseded";
  cursor?: string;
}

function withQuery(path: string, query: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value);
  }
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export function listDocuments(projectId: string, cursor?: string) {
  return apiFetch<CursorPage<SourceDocument>>(
    withQuery(`/projects/${projectId}/documentation/documents`, { cursor }),
  );
}

export function getDocument(projectId: string, documentId: string) {
  return apiFetch<SourceDocumentDetail>(
    `/projects/${projectId}/documentation/documents/${documentId}`,
  );
}

export function cancelDocumentProcessing(projectId: string, documentId: string) {
  return apiFetch<{ cancelledOperationCount: number }>(
    `/projects/${projectId}/documentation/documents/${documentId}/processing/cancel`,
    { method: "POST" },
  );
}

export function retryDocumentProcessing(projectId: string, documentId: string) {
  return apiFetch<{ operationId: string; status: string }>(
    `/projects/${projectId}/documentation/documents/${documentId}/retry-processing`,
    { method: "POST" },
  );
}

export function addNotionDocument(
  projectId: string,
  data: { pageUrl: string },
) {
  return apiFetch<DocumentAcknowledgement>(
    `/projects/${projectId}/documentation/documents/notion`,
    { method: "POST", body: data },
  );
}

export async function uploadDocument(
  projectId: string,
  file: File,
): Promise<DocumentAcknowledgement> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(
    `${API_URL}/projects/${projectId}/documentation/documents`,
    { method: "POST", credentials: "include", body: formData },
  );
  const text = await response.text();
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = JSON.parse(text) as {
        message?: string | string[];
        code?: string;
      };
      message = Array.isArray(body.message)
        ? body.message.join(", ")
        : (body.message ?? body.code ?? message);
    } catch {
      // The HTTP status remains the safe fallback for a non-JSON proxy error.
    }
    throw new ApiError(message, response.status);
  }
  return JSON.parse(text) as DocumentAcknowledgement;
}

export function getCanonicalSource(
  projectId: string,
  options: CanonicalSourceOptions = {},
) {
  return apiFetch<CanonicalSourcePage>(
    withQuery(`/projects/${projectId}/documentation/source`, {
      revisionId: options.revisionId,
      cursor: options.cursor,
    }),
  );
}

export function listSourceRevisions(projectId: string, cursor?: string) {
  return apiFetch<CursorPage<SourceRevisionSummary>>(
    withQuery(`/projects/${projectId}/documentation/source/revisions`, {
      cursor,
    }),
  );
}

export function getItemProvenance(
  projectId: string,
  itemId: string,
  revisionId?: string,
) {
  return apiFetch<ItemProvenance>(
    withQuery(
      `/projects/${projectId}/documentation/source/items/${itemId}/provenance`,
      { revisionId },
    ),
  );
}

export function correctSourceItem(
  projectId: string,
  itemId: string,
  data: GuidedCorrectionRequest,
) {
  return apiFetch<{ status: "completed"; revisionId: string }>(
    `/projects/${projectId}/documentation/source/items/${itemId}/corrections`,
    { method: "POST", body: data },
  );
}

export function listClarifications(
  projectId: string,
  options: ClarificationOptions = {},
) {
  return apiFetch<CursorPage<Clarification>>(
    withQuery(`/projects/${projectId}/documentation/clarifications`, {
      status: options.status,
      cursor: options.cursor,
    }),
  );
}

export function resolveClarifications(
  projectId: string,
  data: ResolveClarificationsRequest,
) {
  return apiFetch<ResolveClarificationsResponse>(
    `/projects/${projectId}/documentation/clarifications/resolutions`,
    { method: "POST", body: data },
  );
}

export function getDocumentationWorkspace(projectId: string) {
  return apiFetch<DocumentationWorkspace>(
    `/projects/${projectId}/documentation`,
  );
}





export function getClientContentPreview(projectId: string) {
  return apiFetch<ClientContentPreview>(
    `/projects/${projectId}/documentation/client-content`,
  );
}

export function getPublicClientSections(projectId: string) {
  return apiFetch<PublicClientSection[]>(
    `/projects/${projectId}/documentation/public-sections`,
  );
}






export function previewDocumentRemoval(projectId: string, documentId: string) {
  return apiFetch<DocumentRemovalPreview>(
    `/projects/${projectId}/documentation/documents/${documentId}/removal-preview`,
  );
}
export function confirmDocumentRemoval(
  projectId: string,
  documentId: string,
  data: ConfirmDocumentRemoval,
) {
  return apiFetch<{
    status: "completed" | "needs_attention";
    revisionId?: string;
    code?: string;
  }>(`/projects/${projectId}/documentation/documents/${documentId}/removal`, {
    method: "POST",
    body: data,
  });
}
export function retryDocumentRemoval(projectId: string, documentId: string) {
  return apiFetch<{
    status: "completed" | "needs_attention";
    revisionId?: string;
  }>(
    `/projects/${projectId}/documentation/documents/${documentId}/removal/retry`,
    { method: "POST" },
  );
}

// ─── Author-defined client sections (specs/017) ───────────────────────────────

export function listSections(projectId: string) {
  return apiFetch<{ sections: SectionView[] }>(
    `/projects/${projectId}/documentation/sections`,
  );
}

export function createSection(projectId: string, body: CreateSectionRequest) {
  return apiFetch<SectionView>(`/projects/${projectId}/documentation/sections`, {
    method: "POST",
    body,
  });
}

export function updateSection(
  projectId: string,
  sectionId: string,
  body: UpdateSectionRequest,
) {
  return apiFetch<SectionView>(
    `/projects/${projectId}/documentation/sections/${sectionId}`,
    { method: "PATCH", body },
  );
}

export function archiveSection(projectId: string, sectionId: string) {
  return apiFetch<{ archived: true }>(
    `/projects/${projectId}/documentation/sections/${sectionId}`,
    { method: "DELETE" },
  );
}

export function reorderSections(projectId: string, orderedSectionIds: string[]) {
  return apiFetch<{ sections: SectionView[] }>(
    `/projects/${projectId}/documentation/sections/order`,
    { method: "POST", body: { orderedSectionIds } },
  );
}

export function composeSection(projectId: string, sectionId: string) {
  return apiFetch<{ proposalId: string; operationId: string }>(
    `/projects/${projectId}/documentation/sections/${sectionId}/composition`,
    { method: "POST" },
  );
}

// A section that has never composed has no proposal, and the API says so with
// an empty body. `apiFetch` reads that as `undefined`, which TanStack Query
// rejects as a query result — so "nothing yet" arrived at the screen as a
// failed request, and the screen believed it.
export function getSectionProposal(projectId: string, sectionId: string) {
  return apiFetch<SectionProposalDetail | null>(
    `/projects/${projectId}/documentation/sections/${sectionId}/proposal`,
  ).then((proposal) => proposal ?? null);
}

export function approveSectionProposal(
  projectId: string,
  sectionId: string,
  expectedVersion: number,
) {
  return apiFetch<{ proposalId: string; releaseId: string; approved: true }>(
    `/projects/${projectId}/documentation/sections/${sectionId}/proposal/approve`,
    { method: "POST", body: { expectedVersion } },
  );
}
