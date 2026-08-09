import type { CreateResourceNotionRequest, Resource } from "schemas";
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

export function approveResourceCategory(
  projectId: string,
  resourceId: string,
  categoryAssignmentId: string,
) {
  return apiFetch<void>(
    `/projects/${projectId}/resources/${resourceId}/categories/${categoryAssignmentId}/approve`,
    { method: "POST" },
  );
}

export function rejectResourceCategory(
  projectId: string,
  resourceId: string,
  categoryAssignmentId: string,
) {
  return apiFetch<void>(
    `/projects/${projectId}/resources/${resourceId}/categories/${categoryAssignmentId}/reject`,
    { method: "POST" },
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
