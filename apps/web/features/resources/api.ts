import type {
  CategoryContent,
  CreateResourceNotionRequest,
  ReferenceDraft,
  Resource,
  ResourceCategoryKey,
} from "schemas";
import { apiFetch, ApiError } from "@/shared/lib/api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// Documents carry no content of their own any more — they are inputs, and the
// list is contributor-only. No locale: there is nothing locale-dependent left
// on a resource.
export function getResources(projectId: string) {
  return apiFetch<Resource[]>(`/projects/${projectId}/resources`);
}

export function getResource(projectId: string, resourceId: string) {
  return apiFetch<Resource>(`/projects/${projectId}/resources/${resourceId}`);
}

export function deleteResource(projectId: string, resourceId: string) {
  return apiFetch<void>(`/projects/${projectId}/resources/${resourceId}`, {
    method: "DELETE",
  });
}

// specs/015 contracts/reference-review.md. What a contributor reviews is a
// queue of independent per-category drafts — not sections of a document.
export function getReferenceDrafts(projectId: string) {
  return apiFetch<ReferenceDraft[]>(`/projects/${projectId}/categories/drafts`);
}

export function acceptDraft(projectId: string, categoryKey: ResourceCategoryKey) {
  return apiFetch<void>(
    `/projects/${projectId}/categories/${categoryKey}/draft/accept`,
    { method: "POST" },
  );
}

export function discardDraft(projectId: string, categoryKey: ResourceCategoryKey) {
  return apiFetch<void>(
    `/projects/${projectId}/categories/${categoryKey}/draft/discard`,
    { method: "POST" },
  );
}

export function regenerateDraft(
  projectId: string,
  categoryKey: ResourceCategoryKey,
  instruction: string,
) {
  return apiFetch<void>(
    `/projects/${projectId}/categories/${categoryKey}/draft/regenerate`,
    { method: "POST", body: { instruction } },
  );
}

// specs/015 FR-023. Only what the contributor actually answered is sent — the
// rest stay open, and their points stay marked in the reference text. There is
// no "skip" call: accepting the draft is the skip.
export function answerDraftQuestions(
  projectId: string,
  categoryKey: ResourceCategoryKey,
  answers: { questionId: string; answer: string }[],
) {
  return apiFetch<void>(
    `/projects/${projectId}/categories/${categoryKey}/draft/answer`,
    { method: "POST", body: { answers } },
  );
}

// What a client reads. Locale-resolved server-side; a category with no content
// is absent from the array, which is what produces "no empty tab".
export function getCategoryContent(projectId: string, locale: string) {
  return apiFetch<CategoryContent[]>(
    `/projects/${projectId}/categories/content?locale=${locale}`,
  );
}

export function connectNotionResource(projectId: string, data: CreateResourceNotionRequest) {
  return apiFetch<Resource>(`/projects/${projectId}/resources/notion`, {
    method: "POST",
    body: data,
  });
}

// Bypasses the shared apiFetch() helper (features/*/api.ts elsewhere) —
// that helper always JSON.stringifies the body and sets
// Content-Type: application/json, incompatible with a real file upload.
// multipart/form-data's boundary header is set automatically by the
// browser when the body is a FormData instance; setting it manually here
// would break the boundary.
export async function uploadResource(projectId: string, file: File): Promise<Resource> {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_URL}/projects/${projectId}/resources`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });

  if (!res.ok) {
    const data: unknown = await res.json().catch(() => null);
    const rawMessage =
      data && typeof data === "object" && "message" in data
        ? (data as { message: unknown }).message
        : undefined;
    const message = Array.isArray(rawMessage) ? rawMessage.join(", ") : (rawMessage ?? res.statusText);
    throw new ApiError(String(message), res.status);
  }

  return res.json() as Promise<Resource>;
}
