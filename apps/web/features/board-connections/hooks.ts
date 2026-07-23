"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateBoardConnectionRequest, PreviewBoardConnectionRequest } from "schemas";
import {
  connectBoard,
  disconnectBoard,
  getBoardConnection,
  previewBoardConnection,
} from "./api";

export const boardConnectionKey = (projectId: string) =>
  ["projects", projectId, "board-connection"] as const;

export function useBoardConnection(projectId: string) {
  return useQuery({
    queryKey: boardConnectionKey(projectId),
    queryFn: () => getBoardConnection(projectId),
  });
}

// Error is surfaced inline in the dialog (see ConnectBoardDialog), not as a
// generic toast — skipGlobalErrorToast opts this out of that default.
export function usePreviewBoardConnection(projectId: string) {
  return useMutation({
    mutationFn: (data: PreviewBoardConnectionRequest) => previewBoardConnection(projectId, data),
    meta: { skipGlobalErrorToast: true },
  });
}

// Error is surfaced inline in the dialog (see ConnectBoardDialog), not as a
// generic toast — skipGlobalErrorToast opts this out of that default.
export function useConnectBoard(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBoardConnectionRequest) => connectBoard(projectId, data),
    meta: { skipGlobalErrorToast: true },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: boardConnectionKey(projectId) });
    },
  });
}

export function useDisconnectBoard(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => disconnectBoard(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: boardConnectionKey(projectId) });
    },
  });
}
