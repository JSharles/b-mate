import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Resource } from "schemas";
import { Link } from "@/i18n/navigation";

const STATUS_LABEL_KEY: Partial<Record<Resource["status"], string>> = {
  processing: "statusProcessing",
  ready_for_review: "statusReadyForReview",
  failed: "statusFailed",
};

// No badge for "published" — that's the default/expected state once a
// resource is visible at all (a client only ever sees published resources,
// so this only ever shows on the developer's own view, for the states that
// need calling out).
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
