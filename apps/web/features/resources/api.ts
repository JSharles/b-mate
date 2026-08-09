import type { CreateResourceNotionRequest, Resource, ResourceCategoryKey } from "schemas";
import { apiFetch, ApiError } from "@/shared/lib/api-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function getResources(projectId: string, locale: string) {
  return apiFetch<Resource[]>(`/projects/${projectId}/resources?locale=${locale}`);
}

export function getResource(projectId: string, resourceId: string, locale: string) {
  return apiFetch<Resource>(
    `/projects/${projectId}/resources/${resourceId}?locale=${locale}`,
  );
}

export function publishResource(projectId: string, resourceId: string) {
  return apiFetch<Resource>(`/projects/${projectId}/resources/${resourceId}/publish`, {
    method: "POST",
  });
}

export function deleteResource(projectId: string, resourceId: string) {
  return apiFetch<void>(`/projects/${projectId}/resources/${resourceId}`, {
    method: "DELETE",
  });
}

// specs/014-category-sections: a contributor reviews what the analysis filed
// where, section by section — the category list itself is frozen, so there is
// nothing to approve about a category any more.
export function approveResourceSection(
  projectId: string,
  resourceId: string,
  sectionId: string,
) {
  return apiFetch<void>(
    `/projects/${projectId}/resources/${resourceId}/sections/${sectionId}/approve`,
    { method: "POST" },
  );
}

export function rejectResourceSection(
  projectId: string,
  resourceId: string,
  sectionId: string,
) {
  return apiFetch<void>(
    `/projects/${projectId}/resources/${resourceId}/sections/${sectionId}/reject`,
    { method: "POST" },
  );
}

export function moveResourceSection(
  projectId: string,
  resourceId: string,
  sectionId: string,
  categoryKey: ResourceCategoryKey,
) {
  return apiFetch<void>(
    `/projects/${projectId}/resources/${resourceId}/sections/${sectionId}/move`,
    { method: "POST", body: { categoryKey } },
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
