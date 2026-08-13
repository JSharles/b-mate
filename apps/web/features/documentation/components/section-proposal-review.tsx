"use client";

import {
  CircleDashed,
  CircleHelp,
  Eye,
  LoaderCircle,
  SearchX,
  TriangleAlert,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { SectionView } from "schemas";
import { Button } from "@/shared/components/ui/button";
import { ApiError } from "@/shared/lib/api-client";
import { ClientSectionView } from "@/shared/components/client-section-view";
import { RoadmapEditor } from "./roadmap-editor";
import {
  useApproveSectionProposal,
  usePublicClientSections,
  useSectionProposal,
} from "../hooks";

export function SectionProposalReview({
  projectId,
  section,
}: {
  projectId: string;
  section: SectionView;
}) {
  const t = useTranslations("Projects.Documentation.Sections.Review");
  const tToasts = useTranslations("Toasts");
  function approveErrorText(error: unknown) {
    if (error instanceof ApiError && error.status === 409) return t("staleError");
    if (error instanceof ApiError) return error.message;
    return tToasts("genericError");
  }

  const proposal = useSectionProposal(projectId, section.id);
  const approve = useApproveSectionProposal(projectId, section.id);
  const published = usePublicClientSections(projectId);
  const live = published.data?.find((entry) => entry.id === section.id);

  // What the client reads is not what the developer reviews: the proposal is
  // the factual layer in their own language, and the published text is derived
  // from it under the rubrique's tone and their client's language. Showing only
  // the proposal left no way to see what the client actually gets.
  function publishedView() {
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Eye className="size-3.5" />
          {t("liveLabel")}
        </p>
        <ClientSectionView section={live!} />
      </div>
    );
  }

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

  // A roadmap is corrected where it is, so there is no "nothing matched" dead
  // end and no separate review: what the developer edits is the timeline
  // itself, and the phases every project runs through are already on the rail
  // waiting to be taken.
  if (section.kind === "roadmap") {
    const pending = current?.status === "pending_review";
    if (current?.status === "composing") {
      return (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
          {t("composing")}
        </p>
      );
    }
    if (current?.status === "failed") {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p>{t("failed")}</p>
        </div>
      );
    }
    if (!pending && live?.kind !== "roadmap") {
      return <p className="text-sm text-muted-foreground">{t("neverComposed")}</p>;
    }
    return (
      <div className="space-y-5">
        <p
          className={`flex items-center gap-2 text-xs uppercase tracking-wide ${pending ? "text-primary" : "text-muted-foreground"}`}
        >
          {pending ? (
            <CircleDashed className="size-3.5" />
          ) : (
            <Eye className="size-3.5" />
          )}
          {pending ? (live ? t("pendingOverLive") : t("pendingLabel")) : t("liveLabel")}
        </p>
        <RoadmapEditor
          projectId={projectId}
          section={section}
          milestones={
            pending
              ? current.milestones
              : live?.kind === "roadmap"
                ? live.milestones
                : []
          }
          proposalVersion={pending ? current.version : undefined}
          editable={pending}
        />
        {pending && (
          <div className="flex flex-wrap items-center gap-3">
            {/* Nothing to publish is nothing to publish: the empty rail above
                says why, so the button does not need a sentence. */}
            <Button
              type="button"
              onClick={() => approve.mutate(current.version)}
              disabled={approve.isPending || current.milestones.length === 0}
            >
              {approve.isPending ? t("approving") : t("approve")}
            </Button>
          </div>
        )}
        {approve.isError && (
          <p role="alert" className="text-sm text-destructive">
            {approveErrorText(approve.error)}
          </p>
        )}
      </div>
    );
  }

  if (!current) {
    return live ? (
      publishedView()
    ) : (
      <p className="text-sm text-muted-foreground">{t("neverComposed")}</p>
    );
  }

  // Nothing is waiting on the developer, so the rubrique shows the one text
  // that still matters: the one their client is reading.
  if (current.status !== "pending_review" && live) return publishedView();

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


  return (
    <div className="space-y-5">
      {/* Composition finishes by poll, not by user action, so the result
          appears with nothing to announce it. A screen reader user would
          otherwise have to go looking for a change they were not told about. */}
      {/* A proposal is not yet what anyone reads: it is waiting on a decision,
          and saying so is what stops it being mistaken for the client's copy. */}
      <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-primary">
        <CircleDashed className="size-3.5" />
        {live ? t("pendingOverLive") : t("pendingLabel")}
      </p>

      <div className="max-w-[68ch] space-y-5" aria-live="polite">
        {current.blocks.map((block, index) =>
          // Something the reference document has not settled, kept unsettled
          // here rather than written around. The box alone said nothing: a
          // developer asked what it was, which is the whole answer as to
          // whether it worked.
          block.kind === "open_point" ? (
            <div
              key={index}
              className="rounded-lg border border-border bg-muted p-4"
            >
              <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <CircleHelp className="size-3.5" />
                {t("openPointLabel")}
              </p>
              <p className="mt-2 text-base leading-[1.75]">{block.text}</p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {t("openPointHint")}
              </p>
            </div>
          ) : (
            <p key={index} className="text-base leading-[1.75]">
              {block.text}
            </p>
          ),
        )}
      </div>

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
          {approveErrorText(approve.error)}
        </p>
      )}
    </div>
  );
}
