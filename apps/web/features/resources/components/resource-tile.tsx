import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Resource } from "schemas";
import { Link } from "@/i18n/navigation";

// No badge for `absorbed` — that is the expected resting state of a document
// whose material now lives in the reference layer.
const STATUS_LABEL_KEY: Partial<Record<Resource["status"], string>> = {
  pending: "statusPending",
  failed: "statusFailed",
};

// Contributor-only: a client never sees this list at all since specs/015 moved
// the reading surface to the category tabs.
export function ResourceTile({ projectId, resource }: { projectId: string; resource: Resource }) {
  const t = useTranslations("Projects.ResourcesList");
  const statusKey = STATUS_LABEL_KEY[resource.status];

  return (
    <li>
      <Link
        href={`/projects/${projectId}/resources/${resource.id}`}
        className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-accent"
      >
        <span className="flex items-center gap-2 text-sm text-foreground">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          {resource.title}
        </span>
        {statusKey && (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {t(statusKey)}
          </span>
        )}
      </Link>
    </li>
  );
}
