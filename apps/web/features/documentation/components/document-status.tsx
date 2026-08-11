"use client";

import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
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
  className,
}: {
  status: SourceDocument["status"];
  className?: string;
}) {
  const t = useTranslations("Projects.Documentation.Documents");

  if (PROCESSING_STATUSES.has(status)) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <CircleDashed className="size-3.5 animate-spin motion-reduce:animate-none" />
        {t("statusProcessing")}
      </span>
    );
  }
  if (status === "removal_pending") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <CircleDashed className="size-3.5 animate-spin motion-reduce:animate-none" />
        {t("statusRemoving")}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-destructive", className)}>
        <AlertCircle className="size-3.5" />
        {t("statusFailed")}
      </span>
    );
  }
  if (status === "removal_failed") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-destructive", className)}>
        <AlertCircle className="size-3.5" />
        {t("statusRemovalFailed")}
      </span>
    );
  }
  if (status === "removed") {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
        <Trash2 className="size-3.5" />
        {t("statusRemoved")}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <CheckCircle2 className="size-3.5 text-emerald-400" />
      {t("statusIncorporated")}
    </span>
  );
}
