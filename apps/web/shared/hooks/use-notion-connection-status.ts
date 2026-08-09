"use client";

import { useQuery } from "@tanstack/react-query";
import { getNotionConnectionStatus } from "../api/notion-connection";

export const notionConnectionStatusKey = (projectId: string) =>
  ["projects", projectId, "notion-connection"] as const;

export function useNotionConnectionStatus(projectId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: notionConnectionStatusKey(projectId),
    queryFn: () => getNotionConnectionStatus(projectId),
    enabled: options?.enabled ?? true,
  });
}
