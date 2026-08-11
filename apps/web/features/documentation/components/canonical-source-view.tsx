"use client";

import {
  AlertCircle,
  FileText,
  PencilLine,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { CanonicalItem } from "schemas";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { ApiError } from "@/shared/lib/api-client";
import {
  useCanonicalSource,
} from "../hooks";
import { GuidedCorrectionDialog } from "./guided-correction-dialog";
import { StepHeading } from "./step-heading";
import { ProvenanceSheet } from "./provenance-sheet";
import { ClarificationsPanel } from "./clarifications-panel";

function SourceItem({
  item,
  onProvenance,
  onCorrection,
}: {
  item: CanonicalItem;
  onProvenance: () => void;
  onCorrection: () => void;
}) {
  const t = useTranslations("Projects.Documentation.Source");
  return (
    <li className="group flex gap-4 border-b border-border py-5 last:border-b-0">
      <span
        className="mt-2 size-1.5 shrink-0 rounded-full bg-primary"
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{t(`kind_${item.kind}`)}</span>
          {item.state === "point_to_clarify" && (
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-muted-foreground">
              <AlertCircle className="size-3" />
              {t("pointToClarify")}
            </span>
          )}
          {item.categories.map((category) => (
            <span key={category}>{t(`category_${category}`)}</span>
          ))}
        </div>
        <p className="max-w-3xl text-sm leading-7 text-foreground">{item.content}</p>
        <div className="flex flex-wrap gap-1">
          <Button type="button" variant="ghost" size="xs" onClick={onProvenance}>
            <ShieldCheck />
            {t("showProvenance", { count: item.provenanceCount })}
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={onCorrection}>
            <PencilLine />
            {t("correctItem")}
          </Button>
        </div>
      </div>
    </li>
  );
}

export function CanonicalSourceView({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.Documentation");
  const source = useCanonicalSource(projectId);
  const [provenanceItem, setProvenanceItem] = useState<CanonicalItem | null>(null);
  const [correctionItem, setCorrectionItem] = useState<CanonicalItem | null>(null);

  const noSourceYet =
    source.isError && source.error instanceof ApiError && source.error.status === 404;
  const revision = source.data?.revision;

  return (
    <section className="border-b border-border pb-8">
      <StepHeading
        step={1}
        namespace="Projects.Documentation.Steps"
        titleKey="title1"
        purposeKey="purpose1"
      />

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="min-w-0">
          <header className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              {revision ? (
                <p className="text-sm text-muted-foreground">
                  {t("Source.revision", { sequence: revision.sequence })}
                  <span aria-hidden="true"> · </span>
                  {revision.summary}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{t("Source.noRevision")}</p>
              )}
            </div>
          </header>

          {source.isPending ? (
            <div className="space-y-4 p-6">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-4/5" />
            </div>
          ) : noSourceYet ? (
            <div className="flex flex-col items-start gap-3 px-6 py-12">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="size-5" />
              </div>
              <div>
                <p className="font-medium">{t("Source.emptyTitle")}</p>
                <p className="mt-1 max-w-lg text-sm leading-relaxed text-muted-foreground">
                  {t("Source.emptyDescription")}
                </p>
              </div>
            </div>
          ) : source.isError || !source.data ? (
            <div className="flex flex-col items-start gap-3 px-6 py-12">
              <AlertCircle className="size-6 text-destructive" />
              <p className="text-sm text-muted-foreground">{t("Source.loadError")}</p>
              <Button type="button" variant="outline" size="sm" onClick={() => source.refetch()}>
                <RefreshCw />
                {t("retry")}
              </Button>
            </div>
          ) : source.data.items.length === 0 ? (
            <p className="px-6 py-12 text-sm text-muted-foreground">{t("Source.noItems")}</p>
          ) : (
            <ul className="px-5 sm:px-6">
              {source.data.items.map((item) => (
                <SourceItem
                  key={item.id}
                  item={item}
                  onProvenance={() => setProvenanceItem(item)}
                  onCorrection={() => setCorrectionItem(item)}
                />
              ))}
            </ul>
          )}
          {source.hasNextPage && (
            <div className="border-t border-border px-5 py-4 sm:px-6">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={source.isFetchingNextPage}
                onClick={() => void source.fetchNextPage()}
              >
                {t(source.isFetchingNextPage ? "Source.loadingMore" : "Source.loadMore")}
              </Button>
            </div>
          )}
        </div>

      </div>

      {revision && (
        <ClarificationsPanel projectId={projectId} revisionId={revision.id} />
      )}

      {revision && provenanceItem && (
        <ProvenanceSheet
          projectId={projectId}
          itemId={provenanceItem.id}
          revisionId={revision.id}
          open
          onOpenChange={(open) => {
            if (!open) setProvenanceItem(null);
          }}
        />
      )}
      {revision && correctionItem && (
        <GuidedCorrectionDialog
          projectId={projectId}
          itemId={correctionItem.id}
          currentContent={correctionItem.content}
          revisionId={revision.id}
          open
          onOpenChange={(open) => {
            if (!open) setCorrectionItem(null);
          }}
        />
      )}
    </section>
  );
}
