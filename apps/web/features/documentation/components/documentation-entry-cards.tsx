"use client";

import {
  AlertTriangle,
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  Lock,
  LoaderCircle,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useDocumentationWorkspace, useReferenceSummary } from "../hooks";

function Card({
  href,
  icon: Icon,
  title,
  state,
  tone,
  spinning,
  locked,
}: {
  href: string;
  icon: typeof BookOpenText;
  title: string;
  state: string;
  tone: "default" | "attention";
  spinning?: boolean;
  locked?: boolean;
}) {
  const StatusIcon = locked
    ? Lock
    : tone === "attention"
      ? AlertTriangle
      : spinning
        ? LoaderCircle
        : CheckCircle2;

  const body = (
    <>
      <span
        className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${
          locked ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
        }`}
      >
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span
          className={`mt-1 flex items-center gap-2 text-sm ${
            tone === "attention" ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          <StatusIcon
            className={`size-4 shrink-0 ${spinning && !locked ? "animate-spin motion-reduce:animate-none" : ""}`}
          />
          <span>{state}</span>
        </span>
      </span>
      {!locked && (
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      )}
    </>
  );

  // A locked door is shown rather than hidden: knowing the job exists and what
  // it waits for is the point. It is not a link, so it cannot be reached by
  // keyboard either — a disabled-looking control that still navigates is worse
  // than no control.
  if (locked) {
    return (
      <div
        aria-disabled
        className="flex items-center gap-4 rounded-xl border border-dashed border-border px-5 py-5"
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </Link>
  );
}

// The developer's two jobs, in the order they happen: build a base they can
// rely on, then turn it into something a client reads. The second waits for the
// first, and says so instead of failing when opened (specs/019).
export function DocumentationEntryCards({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.Documentation.Entries");
  const summary = useReferenceSummary(projectId);
  const workspace = useDocumentationWorkspace(projectId);

  const documentCount = summary.data?.documentCount ?? 0;
  const reference = summary.data?.document ?? null;
  const referenceReady = reference?.status === "ready";
  const priority = workspace.data?.priority ?? "empty";

  const baseState =
    documentCount === 0
      ? t("baseEmpty")
      : reference?.status === "writing"
        ? t("baseWriting")
        : reference?.status === "failed"
          ? t("baseFailed")
          : referenceReady
            ? t("baseReady", { count: documentCount })
            : t("baseNotWritten", { count: documentCount });

  return (
    <section className="grid gap-4 border-b border-border py-6 sm:grid-cols-2">
      <Card
        href={`/projects/${projectId}/documents`}
        icon={BookOpenText}
        title={t("baseTitle")}
        state={baseState}
        tone={reference?.status === "failed" ? "attention" : "default"}
        spinning={reference?.status === "writing"}
      />
      <Card
        href={`/projects/${projectId}/client`}
        icon={Users}
        title={t("clientTitle")}
        state={referenceReady ? t(`priority_${priority}`) : t("clientLocked")}
        tone={
          referenceReady &&
          (priority === "needs_action" || priority === "needs_attention")
            ? "attention"
            : "default"
        }
        spinning={referenceReady && priority === "processing"}
        locked={!referenceReady}
      />
    </section>
  );
}
