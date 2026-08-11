"use client";

import { AlertCircle, ArrowLeft, FolderOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useProject } from "@/features/projects/hooks";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { DocumentationWorkspace } from "./documentation-workspace";

// Two jobs used to share one route and one scrollbar: an inventory you manage
// (which documents exist, what state each is in) and a pipeline you advance
// (source → review → voice → what the client sees). They answer different
// questions on different days, so they are separate screens that link to each
// other rather than eight concerns stacked on one page.
//
// Contributor-only, like the inventory: a client is redirected to the project,
// and the API enforces the same rule independently.
export function DocumentationPipelinePage({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.Documentation.Pipeline");
  const project = useProject(projectId);
  const router = useRouter();
  const isClient = project.data?.role === "client";

  useEffect(() => {
    if (isClient) router.replace(`/projects/${projectId}`);
  }, [isClient, projectId, router]);

  if (project.isPending || isClient) return <Skeleton className="h-48 w-full" />;
  if (project.isError || !project.data) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <AlertCircle className="size-8 text-destructive" />
        <p className="text-sm text-muted-foreground">{t("loadError")}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => project.refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <div className="space-y-5">
        <Link
          href={`/projects/${projectId}`}
          className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("back")}
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              {t("description")}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/projects/${projectId}/documents`}>
              <FolderOpen />
              {t("manageDocuments")}
            </Link>
          </Button>
        </div>
      </div>

      <DocumentationWorkspace projectId={projectId} />
    </main>
  );
}
