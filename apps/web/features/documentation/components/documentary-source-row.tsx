"use client";

import { CheckCircle2, CircleDashed, LoaderCircle, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SettingsRow } from "@/shared/components/settings-row";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useReferenceSummary } from "../hooks";

// The documents a project runs on sit with Board, Notion and the preferences,
// because that is what they are: something configured once and revisited when
// it changes. The client documentation is the feature, and it stays a card at
// the top of the page. Same page, two levels — the hierarchy comes from where
// each thing is placed rather than from one of them being lit up (specs/019).
export function DocumentarySourceRow({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.Documentation.SourceRow");
  const summary = useReferenceSummary(projectId);

  if (summary.isPending) {
    return (
      <SettingsRow title={t("title")} description={<Skeleton className="h-4 w-40" />}>
        <Skeleton className="h-9 w-24" />
      </SettingsRow>
    );
  }

  const documentCount = summary.data?.documentCount ?? 0;
  const status = summary.data?.document?.status;
  const openPointCount = summary.data?.openPointCount ?? 0;
  const owed = summary.data?.needsRewrite && status === "ready";

  const [Icon, tone, text] =
    documentCount === 0
      ? ([CircleDashed, "text-muted-foreground", t("noDocuments")] as const)
      : status === "writing"
        ? ([LoaderCircle, "text-muted-foreground", t("writing")] as const)
        : status === "failed"
          ? ([TriangleAlert, "text-destructive", t("failed")] as const)
          : status !== "ready"
            ? ([CircleDashed, "text-muted-foreground", t("notWritten", { count: documentCount })] as const)
            : owed
              ? ([CircleDashed, "text-muted-foreground", t("owed", { count: documentCount })] as const)
              : openPointCount > 0
                ? ([CheckCircle2, "text-primary", t("readyWithPoints", { count: documentCount, points: openPointCount })] as const)
                : ([CheckCircle2, "text-primary", t("ready", { count: documentCount })] as const);

  return (
    <SettingsRow
      title={t("title")}
      description={
        <span className="flex items-center gap-1.5">
          <Icon
            className={`size-4 shrink-0 ${tone} ${status === "writing" ? "animate-spin motion-reduce:animate-none" : ""}`}
          />
          {text}
        </span>
      }
    >
      <Button asChild variant="outline" size="sm">
        <Link href={`/projects/${projectId}/documentation/sources`}>
          {documentCount === 0 ? t("start") : t("manage")}
        </Link>
      </Button>
    </SettingsRow>
  );
}
