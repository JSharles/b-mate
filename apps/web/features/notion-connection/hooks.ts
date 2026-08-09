"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateNotionConnectionRequest } from "schemas";
import { notionConnectionStatusKey } from "@/shared/hooks/use-notion-connection-status";
import { connectNotionConnection, disconnectNotionConnection, getNotionConnection } from "./api";

// Reuses the shared key (apps/web/shared/hooks/use-notion-connection-status.ts)
// so connecting/disconnecting here invalidates the same cache entry
// features/resources' Add Resource dialog reads (specs/012-project-settings
// research.md Decision 4) — one query, two consumers.
export function useNotionConnection(projectId: string) {
  return useQuery({
    queryKey: notionConnectionStatusKey(projectId),
    queryFn: () => getNotionConnection(projectId),
  });
}

// Error is surfaced inline in the dialog (see ConnectNotionDialog), not as a
// generic toast — skipGlobalErrorToast opts this out of that default.
export function useConnectNotionConnection(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateNotionConnectionRequest) => connectNotionConnection(projectId, data),
    meta: { skipGlobalErrorToast: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notionConnectionStatusKey(projectId) });
    },
  });
}

// Error is surfaced inline in the disconnect confirmation dialog (see
// NotionConnectionCard), not as a generic toast — skipGlobalErrorToast opts
// this out of that default.
export function useDisconnectNotionConnection(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => disconnectNotionConnection(projectId),
    meta: { skipGlobalErrorToast: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notionConnectionStatusKey(projectId) });
    },
  });
}
