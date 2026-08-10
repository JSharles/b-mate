"use client";

import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { resourceCategoryLabel } from "schemas";
import type { ReferenceDraft } from "schemas";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  useAcceptDraft,
  useAnswerDraftQuestions,
  useReferenceDrafts,
} from "../hooks";
import { RegenerateDraftDialog } from "./regenerate-draft-dialog";

// specs/015 US2. The contributor's single review gate: this is where facts,
// dates and contradictions are checked. Everything downstream — what the
// client eventually reads — derives from what is approved here, without a
// second approval queue (FR-014).
//
// FR-014a: independent items, one per category, deliberately not grouped by
// the document that triggered them. Approving one publishes that category on
// its own; leaving another pending blocks nothing.
export function ReferenceDraftQueue({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.ReferenceDraftQueue");
  const { data: drafts, isPending } = useReferenceDrafts(projectId);
  const [refusing, setRefusing] = useState<ReferenceDraft | null>(null);

  return (
    <div className="flex flex-col gap-3 border-b border-border py-4 last:border-b-0">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{t("title")}</span>
        <p className="text-sm text-muted-foreground">{t("intro")}</p>
      </div>

      {isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : !drafts || drafts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {drafts.map((draft) => (
            <DraftCard
              key={draft.categoryKey}
              projectId={projectId}
              draft={draft}
              onRefuse={() => setRefusing(draft)}
            />
          ))}
        </ul>
      )}

      <RegenerateDraftDialog
        projectId={projectId}
        draft={refusing}
        onOpenChange={(open) => {
          if (!open) setRefusing(null);
        }}
      />
    </div>
  );
}

function DraftCard({
  projectId,
  draft,
  onRefuse,
}: {
  projectId: string;
  draft: ReferenceDraft;
  onRefuse: () => void;
}) {
  const t = useTranslations("Projects.ReferenceDraftQueue");
  const locale = useLocale();
  const accept = useAcceptDraft(projectId);

  // A rebuild in flight has no content worth reading yet, and neither action
  // applies to it — the API refuses both.
  const isGenerating = draft.status === "generating";

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">
            {resourceCategoryLabel(draft.categoryKey, locale)}
          </span>
          <span className="text-xs text-muted-foreground">
            {triggerLabel(t, draft)}
            {draft.attempt > 1 && ` · ${t("attempt", { attempt: draft.attempt })}`}
          </span>
        </div>
        {isGenerating ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t("generating")}
          </span>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={accept.isPending}
              onClick={() => accept.mutate({ categoryKey: draft.categoryKey })}
            >
              {t("accept")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={accept.isPending}
              onClick={onRefuse}
            >
              {t("refuse")}
            </Button>
          </div>
        )}
      </div>

      {!isGenerating && (
        <p className="max-w-prose leading-relaxed whitespace-pre-line text-foreground/90">
          {draft.content}
        </p>
      )}

      {!isGenerating && draft.questions.length > 0 && (
        <DraftQuestions projectId={projectId} draft={draft} />
      )}
    </li>
  );
}

// specs/015 FR-021 to FR-023. Deliberately below the text and never in the way
// of the accept button: these are skippable by construction. Leaving them
// unanswered and accepting is a normal outcome — the open points are already
// marked inside the text itself, so nothing is silently arbitrated.
function DraftQuestions({
  projectId,
  draft,
}: {
  projectId: string;
  draft: ReferenceDraft;
}) {
  const t = useTranslations("Projects.ReferenceDraftQueue");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answerQuestions = useAnswerDraftQuestions(projectId);

  const filled = draft.questions
    .map((question) => ({
      questionId: question.id,
      answer: (answers[question.id] ?? "").trim(),
    }))
    .filter((entry) => entry.answer.length > 0);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (filled.length === 0) return;
    answerQuestions.mutate({ categoryKey: draft.categoryKey, answers: filled });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-md bg-muted/50 p-3"
    >
      <p className="text-xs text-muted-foreground">{t("questionsIntro")}</p>
      {draft.questions.map((question) => (
        <div key={question.id} className="flex flex-col gap-1.5">
          <Label htmlFor={`question-${question.id}`} className="text-sm font-normal">
            {question.question}
          </Label>
          <Input
            id={`question-${question.id}`}
            value={answers[question.id] ?? ""}
            onChange={(event) =>
              setAnswers((current) => ({
                ...current,
                [question.id]: event.target.value,
              }))
            }
            placeholder={t("answerPlaceholder")}
          />
        </div>
      ))}
      <Button
        type="submit"
        size="sm"
        variant="outline"
        className="w-fit"
        disabled={filled.length === 0 || answerQuestions.isPending}
      >
        {answerQuestions.isPending ? t("answerPending") : t("answer")}
      </Button>
    </form>
  );
}

function triggerLabel(
  t: ReturnType<typeof useTranslations<"Projects.ReferenceDraftQueue">>,
  draft: ReferenceDraft,
): string {
  if (draft.trigger === "document_removed") {
    return t("triggerDocumentRemoved");
  }
  if (draft.trigger === "regeneration_requested") {
    return t("triggerRegeneration");
  }
  return t("triggerDocumentAdded", { document: draft.triggerDocumentTitle ?? "" });
}
