import type { NotionConnectionStatus } from "schemas";
import { apiFetch } from "../lib/api-client";

// Read-only — both the documentation dialog and
// features/notion-connection (Settings) need to know whether a project has
// a Notion connection; only the latter manages it (specs/012-project-settings
// research.md Decision 4).
export function getNotionConnectionStatus(projectId: string) {
  return apiFetch<NotionConnectionStatus>(`/projects/${projectId}/notion-connection`);
}
