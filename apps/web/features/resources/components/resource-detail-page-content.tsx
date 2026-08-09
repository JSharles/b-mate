"use client";

import { AlertTriangle, Clock, Download, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Resource } from "schemas";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/shared/components/ui/button";
import { useDeleteResource, usePublishResource } from "../hooks";
import { SectionReviewList } from "./section-review-list";

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

// specs/014-category-sections Q2: this page is the contributor's review
// screen and nothing else. A client never reaches it — they read every
// section inline under the project's category tabs — so there is no longer a
// `canManage` prop and no role branching here. The API enforces the same rule
// independently (findOne returns 404 for a client).
export function ResourceDetailPageContent({
  projectId,
  resource,
}: {
  projectId: string;
  resource: Resource;
}) {
  const t = useTranslations("Projects.ResourceDetailPage");
  const router = useRouter();
  const publish = usePublishResource(projectId);
  const deleteResource = useDeleteResource(projectId);

  function handlePublish() {
    publish.mutate(resource.id);
  }

  function handleDelete() {
    deleteResource.mutate(resource.id, {
      onSuccess: () => router.push(`/projects/${projectId}`),
    });
  }

  // research.md Decision 4: publishing with nothing approved would produce a
  // resource that is published yet contributes to no tab. The API refuses it;
  // disabling the button here explains why before the click rather than after.
  const hasApprovedSection = resource.sections.some(
    (section) => section.status === "approved",
  );
  const canPublish = resource.status === "ready_for_review";

  const actions = (
    <div className="flex shrink-0 gap-2">
      {canPublish && (
        <Button
          type="button"
          onClick={handlePublish}
          disabled={publish.isPending || !hasApprovedSection}
        >
          {publish.isPending ? t("publishPending") : t("publish")}
        </Button>
      )}
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

  if (resource.status === "processing") {
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
      {canPublish && !hasApprovedSection && (
        <p className="text-sm text-muted-foreground">{t("publishBlocked")}</p>
      )}
      <SectionReviewList projectId={projectId} resource={resource} />
      <OriginalDocument resource={resource} />
    </article>
  );
}
