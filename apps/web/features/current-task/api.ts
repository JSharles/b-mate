import type { CurrentTaskItem } from "schemas";
import { apiFetch } from "@/shared/lib/api-client";

export function getCurrentTask(projectId: string, locale: string) {
  return apiFetch<CurrentTaskItem[]>(
    `/projects/${projectId}/current-task?locale=${locale}`,
  );
}
