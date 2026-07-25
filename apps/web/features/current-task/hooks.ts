"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { getCurrentTask } from "./api";

export const currentTaskKey = (projectId: string, locale: string) =>
  ["projects", projectId, "current-task", locale] as const;

export function useCurrentTask(projectId: string) {
  const locale = useLocale();

  return useQuery({
    queryKey: currentTaskKey(projectId, locale),
    queryFn: () => getCurrentTask(projectId, locale),
  });
}
