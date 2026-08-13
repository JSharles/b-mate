"use client";

import { ArrowRight, FileText, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useReferenceSummary } from "../hooks";
import { StepHeading } from "./step-heading";

// What step 1 shows instead of the source itself. It listed every extracted
// statement — a hundred of them on a real project after two documents, of which
// two asked anything of the contributor, over thirteen thousand pixels of
// scroll. The source is now read on its own screen; this says what it holds and
// points there (specs/018, FR-001 to FR-004, FR-016c).
export function SourceSummary({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.Documentation.Source");
  const summary = useReferenceSummary(projectId);

  return (
    <section className="mb-10">
      <StepHeading
        step={1}
        namespace="Projects.Documentation.Steps"
        titleKey="title1"
        purposeKey="purpose1"
      />

      {summary.isPending ? (
        <Skeleton className="h-24 w-full rounded-xl" aria-label={t("loading")} />
      ) : summary.isError ? (
        // A failed request is not an empty source.
        <p role="alert" className="text-sm text-destructive">
          {t("loadError")}
        </p>
      ) : summary.data.documentCount === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6">
          <p className="text-sm text-muted-foreground">{t("emptyTitle")}</p>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {t("emptyDescription")}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm">
            {t("held", {
              documents: summary.data.documentCount,
              notes: summary.data.noteCount,
            })}
          </p>
          {/* A count and a way in, never a second list of the points
              themselves: they are answered where they appear, in the
              document. */}
          {summary.data.openPointCount > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("openPoints", { count: summary.data.openPointCount })}
            </p>
          )}
          {summary.data.needsRewrite && summary.data.document && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("needsRewrite")}
            </p>
          )}
          <Link
            href={`/projects/${projectId}/documentation/reference`}
            className="mt-4 inline-flex items-center gap-2 rounded-md text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {summary.data.document?.status === "writing" ? (
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <FileText className="size-4" />
            )}
            {summary.data.document ? t("readDocument") : t("writeDocument")}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      )}
    </section>
  );
}
