"use client";

import { AlertTriangle, Clock, Download, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Resource } from "schemas";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/shared/components/ui/button";
import { useDeleteResource } from "../hooks";

const PREVIEWABLE_MIME_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

// FR-020: the source document stays reachable — preview when the format
// supports it, download otherwise. Notion-sourced resources have no uploaded
// file (spec.md Assumptions); a link back to the source page stands in.
function OriginalDocument({ resource }: { resource: Resource }) {
  const t = useTranslations("Projects.ResourceDetailPage");

  if (resource.source === "notion") {
    if (!resource.notionPageUrl) return null;
    return (
      <a
        href={resource.notionPageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ExternalLink className="size-4" />
        {t("viewOnNotion")}
      </a>
    );
  }

  if (!resource.originalFileUrl) return null;

  const isPreviewable =
    resource.originalFileMimeType != null &&
    PREVIEWABLE_MIME_TYPES.has(resource.originalFileMimeType);

  return (
    <div className="flex flex-col gap-2">
      {isPreviewable &&
        (resource.originalFileMimeType === "application/pdf" ? (
          <iframe
            src={resource.originalFileUrl}
            title={resource.originalFileName ?? resource.title}
            className="h-96 w-full rounded-md border"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL, not a Next-image-eligible static asset
          <img
            src={resource.originalFileUrl}
            alt={resource.originalFileName ?? resource.title}
            className="max-h-96 w-fit rounded-md border object-contain"
          />
        ))}
      <a
        href={resource.originalFileUrl}
        download={resource.originalFileName ?? undefined}
        className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <Download className="size-4" />
        {t("downloadOriginal")}
      </a>
    </div>
  );
}

// specs/015: review moved to the project-level draft queue, and per-document
// publication is gone (Q3). What remains here is the document itself — its
// original, previewable or downloadable, and the ability to delete it. That is
// why the route survives: the original has nowhere else to live, and folding a
// preview into the list would make the list heavy rather than lighter.
//
// Contributor-only. A client never reaches it, and the API enforces the same
// rule independently.
export function ResourceDetailPageContent({
  projectId,
  resource,
}: {
  projectId: string;
  resource: Resource;
}) {
  const t = useTranslations("Projects.ResourceDetailPage");
  const router = useRouter();
  const deleteResource = useDeleteResource(projectId);

  function handleDelete() {
    deleteResource.mutate(resource.id, {
      onSuccess: () => router.push(`/projects/${projectId}`),
    });
  }

  const actions = (
    <div className="flex shrink-0 gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={handleDelete}
        disabled={deleteResource.isPending}
      >
        {deleteResource.isPending ? t("deletePending") : t("delete")}
      </Button>
    </div>
  );

  if (resource.status === "pending") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Clock className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("processing")}</p>
        {actions}
      </div>
    );
  }

  if (resource.status === "failed") {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <AlertTriangle className="size-8 text-destructive" />
        <p className="text-sm text-destructive">{resource.failureReason ?? t("failed")}</p>
        {actions}
      </div>
    );
  }

  return (
    <article className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">{resource.title}</h1>
        {actions}
      </div>
      <OriginalDocument resource={resource} />
    </article>
  );
}
