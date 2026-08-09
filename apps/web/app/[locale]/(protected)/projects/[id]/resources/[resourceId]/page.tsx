"use client";

import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { use } from "react";
import { useProject } from "@/features/projects/hooks";
import { ResourceDetailPageContent } from "@/features/resources/components/resource-detail-page-content";
import { useResource } from "@/features/resources/hooks";
import { Link } from "@/i18n/navigation";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";

export default function ResourceDetailPage({
  params,
}: {
  params: Promise<{ id: string; resourceId: string }>;
}) {
  const { id, resourceId } = use(params);
  const { data: project, isPending: isProjectPending } = useProject(id);
  const {
    data: resource,
    isPending: isResourcePending,
    isError,
    refetch,
  } = useResource(id, resourceId);
  const t = useTranslations("Projects.ResourceDetailPage");

  if (isProjectPending || isResourcePending) {
    return <Skeleton className="h-8 w-64" />;
  }

  // Same rationale as ProjectPage: an errored refetch keeps stale `data`
  // around by default (React Query), so isError is checked explicitly
  // rather than relying on `!resource` alone.
  if (isError || !project || !resource) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <TriangleAlert className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t("loadErrorTitle")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
          {t("loadErrorRetry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <Link
        href={`/projects/${id}`}
        className="w-fit text-sm text-muted-foreground hover:underline"
      >
        {t("backToProject")}
      </Link>
      <ResourceDetailPageContent
        projectId={id}
        resource={resource}
        canManage={project.role === "contributor"}
      />
    </div>
  );
}
