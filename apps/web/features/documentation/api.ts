import type {
  AsyncOperation,
  CanonicalSourcePage,
  DocumentAcknowledgement,
  GuidedCorrectionRequest,
  ItemProvenance,
  LanguageProposal,
  SourceDocument,
  SourceDocumentDetail,
  SourceRevisionSummary,
  Clarification,
  ResolveClarificationsRequest,
  ResolveClarificationsResponse,
  CategoryDraftDetail,
  CategoryProjection,
  ClientContentPreview,
  DocumentationWorkspace,
  EditorialProfileValues,
  PublicClientCategory,
  ConfirmDocumentRemoval,
  DocumentRemovalPreview,
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
  categoryKey?: "overview" | "how_it_works" | "planning" | "other";
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

export function proposeWorkingLanguage(
  projectId: string,
  data: { expectedSourceRevisionId: string | null; language: "en" | "fr" },
) {
  return apiFetch<LanguageProposal>(
    `/projects/${projectId}/documentation/source/language-proposals`,
    { method: "POST", body: data },
  );
}

export function confirmWorkingLanguage(projectId: string, proposalId: string) {
  return apiFetch<AsyncOperation>(
    `/projects/${projectId}/documentation/source/language-proposals/${proposalId}/confirm`,
    { method: "POST", body: { confirmed: true } },
  );
}

export function listClarifications(
  projectId: string,
  options: ClarificationOptions = {},
) {
  return apiFetch<CursorPage<Clarification>>(
    withQuery(`/projects/${projectId}/documentation/clarifications`, {
      status: options.status,
      categoryKey: options.categoryKey,
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

export function listCategoryDrafts(projectId: string) {
  return apiFetch<CategoryProjection[]>(
    `/projects/${projectId}/documentation/category-drafts`,
  );
}

export function getCategoryDraft(projectId: string, draftId: string) {
  return apiFetch<CategoryDraftDetail>(
    `/projects/${projectId}/documentation/category-drafts/${draftId}`,
  );
}

export function reviewCategoryDraft(
  projectId: string,
  draftId: string,
  action: "accept" | "discard",
  expectedVersion: number,
) {
  return apiFetch<unknown>(
    `/projects/${projectId}/documentation/category-drafts/${draftId}/${action}`,
    { method: "POST", body: { expectedVersion } },
  );
}

export function correctCategoryDraft(
  projectId: string,
  draftId: string,
  expectedVersion: number,
  instruction: string,
) {
  return apiFetch<{ routingCode: string; operationId: string | null }>(
    `/projects/${projectId}/documentation/category-drafts/${draftId}/correct`,
    { method: "POST", body: { expectedVersion, instruction } },
  );
}

export function getClientContentPreview(projectId: string) {
  return apiFetch<ClientContentPreview>(
    `/projects/${projectId}/documentation/client-content`,
  );
}

export function getPublicClientCategories(projectId: string) {
  return apiFetch<PublicClientCategory[]>(
    `/projects/${projectId}/categories/content`,
  );
}

export interface EditorialProfileResponse extends EditorialProfileValues {
  revisionId: string | null;
  sequence: number;
  version: number;
  proposal: {
    id: string;
    status: string;
    version: number;
    before: PublicClientCategory | null;
    after: PublicClientCategory | null;
  } | null;
}

export function getEditorialProfile(projectId: string) {
  return apiFetch<EditorialProfileResponse>(
    `/projects/${projectId}/editorial-profile`,
  );
}

export function proposeEditorialProfile(
  projectId: string,
  expectedVersion: number,
  values: EditorialProfileValues,
) {
  return apiFetch<EditorialProfileResponse["proposal"]>(
    `/projects/${projectId}/editorial-profile/proposals`,
    { method: "POST", body: { expectedVersion, ...values } },
  );
}

export function confirmEditorialProfile(
  projectId: string,
  proposalId: string,
  expectedVersion: number,
) {
  return apiFetch<{ profileRevisionId: string; releaseId: string | null }>(
    `/projects/${projectId}/editorial-profile/proposals/${proposalId}/confirm`,
    { method: "POST", body: { expectedVersion, confirmed: true } },
  );
}

export function cancelEditorialProfile(
  projectId: string,
  proposalId: string,
  expectedVersion: number,
) {
  return apiFetch<{ cancelled: boolean }>(
    `/projects/${projectId}/editorial-profile/proposals/${proposalId}/cancel`,
    { method: "POST", body: { expectedVersion } },
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
