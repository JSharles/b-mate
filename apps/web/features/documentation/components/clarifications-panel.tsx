"use client";

import { AlertCircle, MessageCircleQuestion } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Clarification } from "schemas";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useClarifications, useResolveClarifications } from "../hooks";

function ClarificationCard({
  clarification,
  revisionId,
  resolve,
}: {
  clarification: Clarification;
  revisionId: string;
  resolve: ReturnType<typeof useResolveClarifications>;
}) {
  const t = useTranslations("Projects.Documentation.Clarifications");
  const [answer, setAnswer] = useState("");
  const submit = (action: "answer" | "leave_open") => {
    resolve.mutate(
      {
        expectedSourceRevisionId: revisionId,
        resolutions: [
          action === "answer"
            ? {
                clarificationId: clarification.id,
                expectedVersion: clarification.version,
                action,
                answer: answer.trim(),
              }
            : {
                clarificationId: clarification.id,
                expectedVersion: clarification.version,
                action,
              },
        ],
      },
      { onSuccess: () => setAnswer("") },
    );
  };
  return (
    <article className="space-y-4 border-b border-border py-5 last:border-b-0">
      <div className="flex gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold text-foreground">
          {clarification.impactRank}
        </span>
        <div>
          <h4 className="text-sm font-semibold">{clarification.question}</h4>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {clarification.impactExplanation}
          </p>
        </div>
      </div>
      <ul className="space-y-2 pl-10">
        {clarification.evidence.map((evidence, index) => (
          <li key={`${evidence.originId}-${index}`} className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{evidence.label}</span>
            {evidence.excerpt && <p className="mt-1 border-l border-border pl-2">{evidence.excerpt}</p>}
          </li>
        ))}
      </ul>
      <div className="space-y-2 pl-10">
        <Label htmlFor={`answer-${clarification.id}`}>{t("answerLabel")}</Label>
        <textarea
          id={`answer-${clarification.id}`}
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          rows={2}
          className="w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={!answer.trim() || resolve.isPending} onClick={() => submit("answer")}>
            {t("answerAction")}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={resolve.isPending} onClick={() => submit("leave_open")}>
            {t("leaveOpenAction")}
          </Button>
        </div>
      </div>
    </article>
  );
}

export function ClarificationsPanel({ projectId, revisionId }: { projectId: string; revisionId: string }) {
  const t = useTranslations("Projects.Documentation.Clarifications");
  const clarifications = useClarifications(projectId, { status: "open" });
  const resolve = useResolveClarifications(projectId);
  if (clarifications.isPending) return <Skeleton className="h-32 w-full" />;
  if (clarifications.isError) return <p role="alert" className="text-sm text-destructive">{t("loadError")}</p>;
  if (!clarifications.data?.items.length) return null;
  return (
    <section className="border-b border-border py-7">
      <div className="flex items-start gap-3">
        <MessageCircleQuestion className="mt-0.5 size-5 text-muted-foreground" />
        <div>
          <h3 className="font-semibold">{t("title")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("total", { count: clarifications.data.total })}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("optionalHint")}</p>
        </div>
      </div>
      <div className="mt-3">
        {clarifications.data.items.map((clarification) => (
          <ClarificationCard key={clarification.id} clarification={clarification} revisionId={revisionId} resolve={resolve} />
        ))}
        {clarifications.hasNextPage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={clarifications.isFetchingNextPage}
            onClick={() => void clarifications.fetchNextPage()}
          >
            {t(clarifications.isFetchingNextPage ? "loadingMore" : "loadMore")}
          </Button>
        )}
      </div>
      {resolve.isError && <p role="alert" className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="size-4" />{t("resolveError")}</p>}
    </section>
  );
}
