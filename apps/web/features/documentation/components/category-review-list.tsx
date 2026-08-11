"use client";
import { Check, CircleDashed, HelpCircle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ApiError } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import {
  useCategoryDraft,
  useCategoryDrafts,
  useCorrectCategoryDraft,
  useReviewCategoryDraft,
} from "../hooks";
import { StepHeading } from "./step-heading";

// Accepting derives an immutable client release, so it may only be offered
// once there is something to read. A draft still generating has an empty body.
function isReviewable(status: string) {
  return status === "pending_review";
}

// A rejected write must never look like a dead button. These mutations opt out
// of the global toast because their failures are specific — a 409 means the
// source moved under the contributor and the recovery is to reread it, not to
// click again. Naming that is the whole point; the same shape already exists in
// guided-correction-dialog.
function ActionError({ error }: { error: unknown }) {
  const t = useTranslations("Projects.DocumentationNew.Reviews");
  if (!error) return null;
  const isStale = error instanceof ApiError && error.status === 409;
  return (
    <p role="alert" className="mt-3 text-sm text-destructive">
      {t(isStale ? "staleError" : "error")}
    </p>
  );
}

export function CategoryReviewList({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.DocumentationNew.Reviews");
  const list = useCategoryDrafts(projectId);
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useCategoryDraft(projectId, selected);
  const review = useReviewCategoryDraft(projectId);
  const correct = useCorrectCategoryDraft(projectId);
  const [instructions, setInstructions] = useState<Record<string, string>>({});

  const drafts =
    list.data
      ?.map((state) => state.activeDraft)
      .filter((draft): draft is NonNullable<typeof draft> => Boolean(draft)) ?? [];
  // Only a draft that has finished generating can be accepted or refused, so
  // only those count toward "how much is waiting for me".
  const reviewable = drafts.filter((draft) => isReviewable(draft.status));

  return (
    <section className="border-b border-border py-8" aria-label={t("title")}>
      <div className="flex items-start justify-between gap-4">
        <StepHeading
          step={2}
          namespace="Projects.Documentation.Steps"
          titleKey="title2"
          purposeKey="purpose2"
        />
        <span className="mt-0.5 shrink-0 rounded-md bg-muted px-3 py-1 text-xs">
          {t("pendingCount", { count: reviewable.length })}
        </span>
      </div>

      {list.isPending ? (
        <p className="text-sm text-muted-foreground">
          <CircleDashed className="mr-2 inline size-4 animate-spin motion-reduce:animate-none" />
          {t("loading")}
        </p>
      ) : drafts.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <div className="space-y-2">
            {drafts.map((draft) => {
              const isSelected = draft.id === selected;
              return (
                <button
                  key={draft.id}
                  type="button"
                  // Without this the rail has no selected state at all: move the
                  // mouse away and neither a sighted nor a screen-reader user can
                  // tell which of four drafts the right-hand pane is showing.
                  aria-pressed={isSelected}
                  onClick={() => setSelected(draft.id)}
                  className={
                    isSelected
                      ? "w-full rounded-lg border border-primary bg-accent p-3 text-left"
                      : "w-full rounded-lg border border-border bg-card p-3 text-left hover:border-primary/50"
                  }
                >
                  <span className="text-sm font-medium">{t(`category_${draft.categoryKey}`)}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {draft.changeSummary ?? t("generating")}
                  </span>
                </button>
              );
            })}
          </div>

          {detail.data && !isReviewable(detail.data.status) ? (
            <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
              <CircleDashed className="mb-2 size-5 animate-spin motion-reduce:animate-none" />
              {t("draftGenerating")}
            </div>
          ) : detail.data ? (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="space-y-4">
                {detail.data.blocks.map((block, index) =>
                  block.type === "open_point" ? (
                    // An open point is an admitted unknown, not an error and not
                    // an emphasis — so it is marked by a label and an icon rather
                    // than by a second accent colour (DESIGN.md, One Voice Rule).
                    <div
                      key={index}
                      className="rounded-md border border-border bg-muted p-3"
                    >
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                        <HelpCircle className="size-3.5" />
                        {t("openPoint")}
                      </p>
                      <p className="mt-1.5 leading-7">{block.text}</p>
                    </div>
                  ) : (
                    <p key={index} className="leading-7">
                      {block.text}
                    </p>
                  ),
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-2">
                <Button
                  disabled={review.isPending}
                  onClick={() =>
                    review.mutate({
                      draftId: detail.data.id,
                      action: "accept",
                      expectedVersion: detail.data.version,
                    })
                  }
                >
                  <Check />
                  {t("accept")}
                </Button>
                <Button
                  variant="outline"
                  disabled={review.isPending}
                  onClick={() =>
                    review.mutate({
                      draftId: detail.data.id,
                      action: "discard",
                      expectedVersion: detail.data.version,
                    })
                  }
                >
                  <X />
                  {t("discard")}
                </Button>
              </div>
              <ActionError error={review.error} />
              {review.isSuccess && (
                <p role="status" className="mt-3 text-sm text-muted-foreground">
                  {review.variables?.action === "accept"
                    ? t("accepted", { remaining: reviewable.length })
                    : t("discarded")}
                </p>
              )}

              <div className="mt-5 border-t border-border pt-5">
                <label className="text-sm font-medium" htmlFor="factual-instruction">
                  {t("correctionLabel")}
                </label>
                <textarea
                  id="factual-instruction"
                  value={instructions[detail.data.id] ?? ""}
                  onChange={(event) =>
                    setInstructions((current) => ({
                      ...current,
                      [detail.data.id]: event.target.value,
                    }))
                  }
                  className="mt-2 min-h-24 w-full rounded-lg border border-input bg-card p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  placeholder={t("correctionPlaceholder")}
                />
                <Button
                  className="mt-2"
                  variant="secondary"
                  disabled={!(instructions[detail.data.id] ?? "").trim() || correct.isPending}
                  onClick={() =>
                    correct.mutate({
                      draftId: detail.data.id,
                      expectedVersion: detail.data.version,
                      instruction: instructions[detail.data.id] ?? "",
                    })
                  }
                >
                  {t("regenerate")}
                </Button>
                {correct.data?.routingCode === "EDITORIAL_INSTRUCTION_REQUIRED" && (
                  <p role="status" className="mt-2 text-sm text-muted-foreground">
                    {t("editorialRedirect")}
                  </p>
                )}
                <ActionError error={correct.error} />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
              {t("select")}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
