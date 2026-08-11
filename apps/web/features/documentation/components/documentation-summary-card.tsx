"use client";

import {
  AlertTriangle,
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  LoaderCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useDocumentationWorkspace } from "../hooks";

export function DocumentationSummaryCard({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.DocumentationNew.Workspace");
  const pageT = useTranslations("Projects.Documentation.Page");
  const workspace = useDocumentationWorkspace(projectId);
  const state = workspace.data;
  const priority = state?.priority ?? "empty";

  const StatusIcon =
    priority === "needs_attention" || priority === "needs_action"
      ? AlertTriangle
      : priority === "processing"
        ? LoaderCircle
        : CheckCircle2;

  return (
    <section className="border-b border-border py-6">
      <Link
        href={`/projects/${projectId}/documentation`}
        className="group flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <BookOpenText className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{pageT("summaryTitle")}</span>
          <span className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <StatusIcon
              className={`size-4 shrink-0 ${priority === "processing" ? "animate-spin motion-reduce:animate-none" : ""}`}
            />
            <span>{t(`priority_${priority}`)}</span>
          </span>
        </span>
        <span className="hidden text-sm font-medium text-muted-foreground transition-colors group-hover:text-foreground sm:block">
          {pageT("manage")}
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </section>
  );
}
