"use client";

import { AlertCircle, CheckCircle2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SourceDocument } from "schemas";
import { cn } from "@/shared/lib/utils";

// A document is read once at upload and then it is in. There is no pipeline
// behind it any more, so there is no "processing for six hours" to explain and
// no spinner to hold (specs/018).
export function DocumentStatus({
  status,
  className,
}: {
  status: SourceDocument["status"];
  className?: string;
}) {
  const t = useTranslations("Projects.Documentation.Documents");

  const muted = cn(
    "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
    className,
  );
  const bad = cn(
    "inline-flex items-center gap-1.5 text-xs text-destructive",
    className,
  );

  if (status === "failed") {
    return (
      <span className={bad}>
        <AlertCircle className="size-3.5" />
        {t("statusFailed")}
      </span>
    );
  }
  if (status === "removed") {
    return (
      <span className={muted}>
        <Trash2 className="size-3.5" />
        {t("statusRemoved")}
      </span>
    );
  }
  if (status === "incorporated") {
    return (
      <span className={muted}>
        <CheckCircle2 className="size-3.5 text-primary" />
        {t("statusIncorporated")}
      </span>
    );
  }

  // Explicit rather than a fallthrough: an unrecognised status used to render
  // as a green check and "intégré à la source" — wrong, and reassuring about it.
  return (
    <span className={muted}>
      <AlertCircle className="size-3.5" />
      {t("statusUnavailable")}
    </span>
  );
}
