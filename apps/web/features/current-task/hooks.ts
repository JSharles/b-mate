"use client";

import { useQuery } from "@tanstack/react-query";
import { getCurrentTask } from "./api";

export const currentTaskKey = (projectId: string) =>
  ["projects", projectId, "current-task"] as const;

export function useCurrentTask(projectId: string) {
  return useQuery({
    queryKey: currentTaskKey(projectId),
    queryFn: () => getCurrentTask(projectId),
  });
}
