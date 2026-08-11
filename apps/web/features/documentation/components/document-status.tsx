"use client";

import { AlertCircle, CheckCircle2, CircleDashed, Trash2 } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import type { SourceDocument } from "schemas";
import { cn } from "@/shared/lib/utils";

const PROCESSING_STATUSES = new Set<SourceDocument["status"]>([
  "received",
  "extracting",
  "ready_to_consolidate",
  "incorporating",
  "retrying",
]);

export function DocumentStatus({
  status,
  createdAt,
  className,
}: {
  status: SourceDocument["status"];
  createdAt?: string;
  className?: string;
}) {
  const t = useTranslations("Projects.Documentation.Documents");
  const format = useFormatter();
  // `relativeTime` needs an explicit reference point. Without one next-intl
  // falls back to "now" at render time and logs ENVIRONMENT_FALLBACK, and the
  // server and client can disagree about what "now" was. `useNow` also makes
  // the elapsed time actually advance, which is the whole reason it is here:
  // a document sits in the queue for minutes to hours.
  const now = useNow({ updateInterval: 60_000 });

  const muted = cn(
    "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
    className,
  );
  const bad = cn("inline-flex items-center gap-1.5 text-xs text-destructive", className);

  // Extraction runs on a batch queue: minutes, sometimes hours. A bare spinner
  // is a promise of imminence, and holding one that long is what drives a
  // contributor to re-upload the same document. Elapsed time turns "is this
  // stuck?" into a question the row answers by itself.
  const since = createdAt ? format.relativeTime(new Date(createdAt), now) : null;

  if (PROCESSING_STATUSES.has(status)) {
    return (
      <span className={muted} role="status">
        <CircleDashed className="size-3.5 animate-spin motion-reduce:animate-none" />
        {since ? t("statusProcessingSince", { since }) : t("statusProcessing")}
      </span>
    );
  }
  if (status === "removal_pending") {
    return (
      <span className={muted} role="status">
        <CircleDashed className="size-3.5 animate-spin motion-reduce:animate-none" />
        {t("statusRemoving")}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className={bad} role="status">
        <AlertCircle className="size-3.5" />
        {t("statusFailed")}
      </span>
    );
  }
  if (status === "removal_failed") {
    return (
      <span className={bad} role="status">
        <AlertCircle className="size-3.5" />
        {t("statusRemovalFailed")}
      </span>
    );
  }
  if (status === "removed") {
    return (
      <span className={muted} role="status">
        <Trash2 className="size-3.5" />
        {t("statusRemoved")}
      </span>
    );
  }
  if (status === "incorporated") {
    return (
      <span className={muted} role="status">
        <CheckCircle2 className="size-3.5 text-primary" />
        {t("statusIncorporated")}
      </span>
    );
  }

  // Explicit rather than a fallthrough: an unrecognised status used to render
  // as a green check and "intégré à la source" — wrong, and reassuring about it.
  return (
    <span className={muted} role="status">
      <AlertCircle className="size-3.5" />
      {t("statusUnavailable")}
    </span>
  );
}
