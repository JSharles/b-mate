"use client";

import { AlertTriangle, Clock, Download, ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Resource } from "schemas";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import {
  useApproveResourceCategory,
  useDeleteResource,
  usePublishResource,
  useRejectResourceCategory,
} from "../hooks";

const PREVIEWABLE_MIME_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

// FR-007/FR-008: the original document stays reachable (preview when the
// format supports it, download otherwise) for both the developer and,
// once published, the client — not gated on canManage. Notion-sourced
// resources have no uploaded file (spec.md Assumptions); a link back to
// the source page stands in for preview/download there.
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

// specs/013-ai-resource-categorization FR-003/FR-004: every proposed
// category shown to a contributor, each approved/rejected independently —
// approving/rejecting one never affects the others or the resource's own
// publish state. A client only ever receives 'approved' assignments here
// (API-side filter), so this list is never empty-but-hidden for them; it's
// simply shorter.
function CategoryChips({
  projectId,
  resource,
  canManage,
}: {
  projectId: string;
  resource: Resource;
  canManage: boolean;
}) {
  const t = useTranslations("Projects.ResourceDetailPage");
  const approve = useApproveResourceCategory(projectId);
  const reject = useRejectResourceCategory(projectId);

  if (resource.categories.length === 0) return null;

  const pending = approve.isPending || reject.isPending;

  return (
    <ul className="flex flex-wrap items-center gap-2">
      {resource.categories.map((category) => (
        <li
          key={category.id}
          className="flex items-center gap-1.5 rounded-full border border-border bg-muted py-1 pr-1 pl-2.5 text-xs font-medium text-muted-foreground"
        >
          {category.label}
          {canManage && category.status === "proposed" ? (
            <span className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  approve.mutate({
                    resourceId: resource.id,
                    categoryAssignmentId: category.id,
                  })
                }
              >
                {t("categoryApprove")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={pending}
                onClick={() =>
                  reject.mutate({
                    resourceId: resource.id,
                    categoryAssignmentId: category.id,
                  })
                }
              >
                {t("categoryReject")}
              </Button>
            </span>
          ) : (
            <span
              className={cn(
                "pr-1.5 text-xs tracking-wide uppercase",
                category.status === "rejected" && "line-through",
              )}
            >
              {category.status === "approved" ? t("categoryApproved") : t("categoryRejected")}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

// specs/011-project-resources: `canManage` (contributor-only) controls the
// Publish/Delete actions — a client only ever reaches this component for a
// published resource (FR-010 already filters what the API returns) and
// never manages anything (US3's preview/download for the client view lands
// separately, T039).
export function ResourceDetailPageContent({
  projectId,
  resource,
  canManage,
}: {
  projectId: string;
  resource: Resource;
  canManage: boolean;
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

  // FR-014: delete is allowed from any state; FR-016: publish only from
  // ready_for_review.
  const actions = canManage && (
    <div className="flex shrink-0 gap-2">
      {resource.status === "ready_for_review" && (
        <Button type="button" onClick={handlePublish} disabled={publish.isPending}>
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
        <p className="text-sm text-destructive">{t("failed")}</p>
        {actions}
      </div>
    );
  }

  return (
    <article className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold">{resource.vulgarizedTitle ?? resource.title}</h1>
        {actions}
      </div>
      <CategoryChips projectId={projectId} resource={resource} canManage={canManage} />
      {resource.vulgarizedContent && (
        <p className="max-w-prose leading-relaxed whitespace-pre-line text-foreground/90">
          {resource.vulgarizedContent}
        </p>
      )}
      <OriginalDocument resource={resource} />
    </article>
  );
}
