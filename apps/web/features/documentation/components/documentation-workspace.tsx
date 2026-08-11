"use client";

import { AlertTriangle, CheckCircle2, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useDocumentationWorkspace } from "../hooks";
import { CanonicalSourceView } from "./canonical-source-view";
import { CategoryReviewList } from "./category-review-list";
import { ClientContentPreview } from "./client-content-preview";
import { EditorialProfileSettings } from "./editorial-profile-settings";
export function DocumentationWorkspace({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.DocumentationNew.Workspace");
  const workspace = useDocumentationWorkspace(projectId);
  const state = workspace.data;
  const priority = state?.priority ?? "empty";

  return (
    <div className="flex flex-col">
      <div
        aria-live="polite"
        className="mb-6 flex items-start gap-3 rounded-xl border border-border bg-card p-4"
      >
        {priority === "needs_attention" || priority === "needs_action" ? (
          <AlertTriangle className="mt-0.5 size-5 text-destructive" />
        ) : priority === "processing" ? (
          <LoaderCircle className="mt-0.5 size-5 animate-spin text-primary motion-reduce:animate-none" />
        ) : (
          <CheckCircle2 className="mt-0.5 size-5 text-emerald-400" />
        )}
        <div>
          <p className="font-medium">{t(`priority_${priority}`)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(`visibility_${state?.clientVisibility ?? "nothing_published"}`)}
            {state?.releaseProgress
              ? ` · ${state.releaseProgress.ready}/${state.releaseProgress.expected}`
              : ""}
          </p>
          {workspace.isError && (
            <p className="mt-1 text-xs text-amber-300">{t("refreshDelayed")}</p>
          )}
        </div>
      </div>
      <CanonicalSourceView projectId={projectId} />
      <CategoryReviewList projectId={projectId} />
      <ClientContentPreview projectId={projectId} />
      <EditorialProfileSettings projectId={projectId} />
    </div>
  );
}
