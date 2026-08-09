import type { CreateNotionConnectionRequest, NotionConnectionStatus } from "schemas";
import { apiFetch } from "@/shared/lib/api-client";

export function getNotionConnection(projectId: string) {
  return apiFetch<NotionConnectionStatus>(`/projects/${projectId}/notion-connection`);
}

export function connectNotionConnection(
  projectId: string,
  data: CreateNotionConnectionRequest,
) {
  return apiFetch<NotionConnectionStatus>(`/projects/${projectId}/notion-connection`, {
    method: "POST",
    body: data,
  });
}

export function disconnectNotionConnection(projectId: string) {
  return apiFetch<void>(`/projects/${projectId}/notion-connection`, {
    method: "DELETE",
  });
}
