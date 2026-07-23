import type {
  AvailableBoard,
  BoardConnection,
  CreateBoardConnectionRequest,
  PreviewBoardConnectionRequest,
} from "schemas";
import { apiFetch } from "@/shared/lib/api-client";

// NestJS sends an empty body (no JSON at all) when the controller returns
// null, which apiFetch normalizes to `undefined` — but this feeds a
// useQuery, and TanStack Query forbids a query function from ever resolving
// to `undefined`, so it's coerced back to `null` here at the boundary.
export async function getBoardConnection(projectId: string): Promise<BoardConnection | null> {
  const result = await apiFetch<BoardConnection | undefined>(
    `/projects/${projectId}/board-connection`,
  );
  return result ?? null;
}

export function previewBoardConnection(projectId: string, data: PreviewBoardConnectionRequest) {
  return apiFetch<AvailableBoard[]>(`/projects/${projectId}/board-connection/preview`, {
    method: "POST",
    body: data,
  });
}

export function connectBoard(projectId: string, data: CreateBoardConnectionRequest) {
  return apiFetch<BoardConnection>(`/projects/${projectId}/board-connection`, {
    method: "POST",
    body: data,
  });
}

export function disconnectBoard(projectId: string) {
  return apiFetch<void>(`/projects/${projectId}/board-connection`, {
    method: "DELETE",
  });
}
