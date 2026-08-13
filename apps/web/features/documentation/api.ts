import type {
  DocumentAcknowledgement,
  SourceDocument,
  SourceDocumentDetail,
  ClientContentPreview,
  DocumentationWorkspace,
  ConfirmDocumentRemoval,
  DocumentRemovalPreview,
  PublicClientSection,
  CreateSectionRequest,
  SectionProposalDetail,
  SectionView,
  UpdateSectionRequest,
  ReferenceDocumentView,
  ReferenceSummary,
  AddNoteRequest,
  Note,
  NoteList,
} from "schemas";
import { ApiError, apiFetch } from "@/shared/lib/api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface CursorPage<T> {
  items: T[];
  total: number;
  nextCursor: string | null;
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
  // Adding a document writes the reference document, so this multipart call
  // carries the interface language the same way `apiFetch` does — a first
  // upload should already produce a document in the developer's language.
  const locale =
    typeof document !== "undefined" ? document.documentElement.lang : undefined;
  const response = await fetch(
    `${API_URL}/projects/${projectId}/documentation/documents`,
    {
      method: "POST",
      credentials: "include",
      headers: locale ? { "X-Interface-Locale": locale } : {},
      body: formData,
    },
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
  return apiFetch<{ documentId: string; removed: true }>(
    `/projects/${projectId}/documentation/documents/${documentId}/removal`,
    { method: "POST", body: data },
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

// ─── The reference document (specs/018) ───────────────────────────────────────

export function getReferenceSummary(projectId: string) {
  return apiFetch<ReferenceSummary>(
    `/projects/${projectId}/documentation/reference/summary`,
  );
}

// A project that has never had one answers with an empty body, which apiFetch
// reads as `undefined` — and TanStack Query rejects that as a result. Coerced
// here so "none yet" does not reach the screen as a failed request.
export function getReferenceDocument(projectId: string) {
  return apiFetch<ReferenceDocumentView | null>(
    `/projects/${projectId}/documentation/reference`,
  ).then((document) => document ?? null);
}

export function writeReferenceDocument(projectId: string) {
  return apiFetch<{ documentId: string; operationId: string }>(
    `/projects/${projectId}/documentation/reference`,
    { method: "POST" },
  );
}

// Answering an open point and correcting a paragraph both come here. They are
// the same act — telling Diaphane something the documents do not say (FR-012).
export function addNote(projectId: string, data: AddNoteRequest) {
  return apiFetch<Note>(`/projects/${projectId}/documentation/reference/notes`, {
    method: "POST",
    body: data,
  });
}

export function listNotes(projectId: string) {
  return apiFetch<NoteList>(
    `/projects/${projectId}/documentation/reference/notes`,
  );
}

export function removeNote(projectId: string, noteId: string) {
  return apiFetch<{ removed: true }>(
    `/projects/${projectId}/documentation/reference/notes/${noteId}`,
    { method: "DELETE" },
  );
}
