"use client";

import { CircleHelp, LoaderCircle, SearchX, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SectionView } from "schemas";
import { Button } from "@/shared/components/ui/button";
import { ApiError } from "@/shared/lib/api-client";
import { useApproveSectionProposal, useSectionProposal } from "../hooks";

export function SectionProposalReview({
  projectId,
  section,
}: {
  projectId: string;
  section: SectionView;
}) {
  const t = useTranslations("Projects.Documentation.Sections.Review");
  const tToasts = useTranslations("Toasts");
  const proposal = useSectionProposal(projectId, section.id);
  const approve = useApproveSectionProposal(projectId, section.id);

  if (proposal.isPending) {
    return (
      <p className="text-sm text-muted-foreground" aria-busy="true">
        {t("loading")}
      </p>
    );
  }

  // A failed fetch is not a section that was never written. Falling through to
  // the line below announced "not written yet" for a section holding published
  // content, and offered a rewrite as the fix for a network error.
  if (proposal.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t("loadError")}
      </p>
    );
  }

  const current = proposal.data;
  if (!current) {
    return <p className="text-sm text-muted-foreground">{t("neverComposed")}</p>;
  }

  if (current.status === "composing") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
        {t("composing")}
      </p>
    );
  }

  if (current.status === "failed") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
        {/* A failed composition leaves whatever was approved still readable by
            the client, so this is a retry rather than an incident. */}
        <p>{t("failed")}</p>
      </div>
    );
  }

  // FR-011: a composition that matched nothing says so, instead of showing an
  // empty body the contributor has to interpret.
  if (current.outcome === "nothing_matched") {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        <SearchX className="mt-0.5 size-4 shrink-0" />
        <p>{t("nothingMatched")}</p>
      </div>
    );
  }

  const approveError =
    approve.error instanceof ApiError && approve.error.status === 409
      ? t("staleError")
      : approve.error instanceof ApiError
        ? approve.error.message
        : tToasts("genericError");

  return (
    <div className="space-y-5">
      {/* Composition finishes by poll, not by user action, so the result
          appears with nothing to announce it. A screen reader user would
          otherwise have to go looking for a change they were not told about. */}
      <div className="space-y-3" aria-live="polite">
        {current.blocks.map((block, index) => (
          <p
            key={index}
            className={
              block.kind === "open_point"
                ? "rounded-lg border border-border bg-muted p-3 text-sm leading-7"
                : "max-w-3xl text-sm leading-7"
            }
          >
            {block.text}
          </p>
        ))}
      </div>

      {/* FR-010: what composition could not resolve sits beside the content,
          never inside it. Mixed in, an unanswered question reads as a statement
          of fact — which is the one thing it is not. */}
      {current.questions.length > 0 && (
        <section
          aria-labelledby={`questions-${section.id}`}
          className="rounded-lg border border-border bg-card p-4"
        >
          <h4
            id={`questions-${section.id}`}
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <CircleHelp className="size-4" />
            {t("questionsTitle", { count: current.questions.length })}
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t("questionsHint")}
          </p>
          <ul className="mt-3 space-y-3">
            {current.questions.map((question) => (
              <li key={question.id} className="text-sm">
                <p className="leading-relaxed">{question.question}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {question.impactExplanation}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {current.status === "pending_review" && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => approve.mutate(current.version)}
            disabled={approve.isPending}
          >
            {approve.isPending ? t("approving") : t("approve")}
          </Button>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("approveHint")}
          </p>
        </div>
      )}

      {approve.isError && (
        <p role="alert" className="text-sm text-destructive">
          {approveError}
        </p>
      )}
    </div>
  );
}
