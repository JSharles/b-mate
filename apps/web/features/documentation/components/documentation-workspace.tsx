"use client";

import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  LoaderCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useDocumentationWorkspace } from "../hooks";
import { SourceSummary } from "./source-summary";
import { ClientContentPreview } from "./client-content-preview";
import { SectionList } from "./section-list";

// What a contributor works, in order: the facts the documents contribute, the
// sections they compose from those facts, and what the client ends up reading.
// The client preview is last on purpose — the page closes on the answer to the
// only question a contributor arrives with.
const SECTIONS = [
  { id: "documentation-source", key: "navSource" },
  { id: "documentation-sections", key: "navSections" },
  { id: "documentation-client", key: "navClient" },
] as const;

export function DocumentationWorkspace({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.DocumentationNew.Workspace");
  const workspace = useDocumentationWorkspace(projectId);
  const state = workspace.data;
  const priority = state?.priority ?? "empty";
  const release = state?.releaseProgress;

  return (
    <div className="flex flex-col">
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-border bg-card p-4">
        {priority === "needs_attention" || priority === "needs_action" ? (
          <AlertTriangle className="mt-0.5 size-5 text-destructive" />
        ) : priority === "processing" ? (
          <LoaderCircle className="mt-0.5 size-5 animate-spin text-primary motion-reduce:animate-none" />
        ) : (
          <CheckCircle2 className="mt-0.5 size-5 text-primary" />
        )}
        <div>
          <p aria-live="polite" className="font-medium">
            {t(`priority_${priority}`)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(`visibility_${state?.clientVisibility ?? "nothing_published"}`)}
          </p>
          {/* Atomic publication is the product's most reassuring property and
              it used to be a bare "· 2/4" glued onto the sentence above. The
              progress figures need a release record, but the guarantee itself
              does not — and the moment it reassures most is while categories
              are still waiting, before any release exists. */}
          {release && release.expected > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("releaseProgress", {
                ready: release.ready,
                expected: release.expected,
              })}
            </p>
          )}
          {(state?.pendingReviewCount ?? 0) > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">{t("releaseAtomic")}</p>
          )}

          {/* The most urgent state the system can enter used to be a sentence
              with no object and no verb: a red triangle saying an "operation"
              needed attention, on a page offering nothing to act on. The
              failing document is not in this payload, but the inventory route
              lists it with its retry — so the banner carries the way there. */}
          {(state?.failedOperationCount ?? 0) > 0 && (
            <p className="mt-2 text-sm">
              <Link
                href={`/projects/${projectId}/documents`}
                className="inline-flex items-center gap-1.5 rounded-md text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <FileWarning className="size-4" />
                {t("failedAction")}
              </Link>
            </p>
          )}
          {workspace.isError && (
            <p className="mt-1 text-xs text-muted-foreground">{t("refreshDelayed")}</p>
          )}
        </div>
      </div>

      {/* Expanded sections on one unbounded scroll, with no way to see what is
          on the page or jump to it. */}
      <nav aria-label={t("navLabel")} className="mb-8">
        <ul className="flex flex-wrap gap-2">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="inline-flex rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t(section.key)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/* `tabIndex={-1}` is what lets the anchor move focus INTO the section.
          Without it the browser scrolls but leaves focus behind — measured
          landing on <body>, so the next Tab restarts from the top of the
          document and the nav is worse than useless to a keyboard user. */}
      <div id="documentation-source" tabIndex={-1} className="scroll-mt-6 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <SourceSummary projectId={projectId} />
      </div>
      <div id="documentation-sections" tabIndex={-1} className="scroll-mt-6 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <SectionList projectId={projectId} />
      </div>
      <div id="documentation-client" tabIndex={-1} className="scroll-mt-6 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ClientContentPreview projectId={projectId} />
      </div>
    </div>
  );
}
