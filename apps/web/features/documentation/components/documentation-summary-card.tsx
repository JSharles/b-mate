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
import { useDocumentationWorkspace, useReferenceSummary } from "../hooks";

// One door. The documents this runs on are a setting behind it, not a second
// feature beside it: the developer came to give their client something to read,
// not to manage files (specs/019).
export function DocumentationSummaryCard({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.Documentation.Entry");
  const workspace = useDocumentationWorkspace(projectId);
  const summary = useReferenceSummary(projectId);

  const documentCount = summary.data?.documentCount ?? 0;
  const status = summary.data?.document?.status;
  const priority = workspace.data?.priority ?? "empty";

  // Before a reference document exists there is nothing to say about sections,
  // so the card says what the project is actually waiting for.
  const state =
    documentCount === 0
      ? t("stateNoDocuments")
      : status === "writing"
        ? t("stateWriting")
        : status !== "ready"
          ? t("stateNotWritten")
          : t(`priority_${priority}`);

  const attention =
    status === "failed" ||
    (status === "ready" &&
      (priority === "needs_action" || priority === "needs_attention"));
  const StatusIcon = attention
    ? AlertTriangle
    : status === "writing"
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
          <span className="block font-semibold">{t("title")}</span>
          <span
            className={`mt-1 flex items-center gap-2 text-sm ${
              attention ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            <StatusIcon
              className={`size-4 shrink-0 ${status === "writing" ? "animate-spin motion-reduce:animate-none" : ""}`}
            />
            <span>{state}</span>
          </span>
        </span>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </section>
  );
}
