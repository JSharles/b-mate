"use client";

import { AlertTriangle, CheckCircle2, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useDocumentationWorkspace } from "../hooks";
import { CanonicalSourceView } from "./canonical-source-view";
import { CategoryReviewList } from "./category-review-list";
import { ClientContentPreview } from "./client-content-preview";
import { EditorialProfileSettings } from "./editorial-profile-settings";

// The sections in the order a contributor actually works them: the facts, then
// the decisions on those facts, then how they are worded, and finally what the
// client ends up seeing. The client preview used to sit third of four, so the
// page closed on a settings form — the last thing you saw was dropdowns rather
// than the answer to the only question you came with.
const SECTIONS = [
  { id: "documentation-source", key: "navSource" },
  { id: "documentation-review", key: "navReview" },
  { id: "documentation-editorial", key: "navEditorial" },
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
      <div
        aria-live="polite"
        className="mb-6 flex items-start gap-3 rounded-xl border border-border bg-card p-4"
      >
        {priority === "needs_attention" || priority === "needs_action" ? (
          <AlertTriangle className="mt-0.5 size-5 text-destructive" />
        ) : priority === "processing" ? (
          <LoaderCircle className="mt-0.5 size-5 animate-spin text-primary motion-reduce:animate-none" />
        ) : (
          <CheckCircle2 className="mt-0.5 size-5 text-primary" />
        )}
        <div>
          <p className="font-medium">{t(`priority_${priority}`)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(`visibility_${state?.clientVisibility ?? "nothing_published"}`)}
          </p>
          {/* Atomic publication is the product's most reassuring property and
              it used to be a bare "· 2/4" glued onto the sentence above. The
              contributor has to be able to read what is still missing, and why
              nothing has moved for their client yet. */}
          {release && release.expected > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">
              {t("releaseProgress", {
                ready: release.ready,
                expected: release.expected,
              })}
              {release.ready < release.expected && (
                <span className="mt-1 block text-xs">{t("releaseAtomic")}</span>
              )}
            </p>
          )}
          {workspace.isError && (
            <p className="mt-1 text-xs text-muted-foreground">{t("refreshDelayed")}</p>
          )}
        </div>
      </div>

      {/* Four expanded sections on one unbounded scroll, with no way to see
          what is on the page or jump to it. */}
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

      <div id="documentation-source" className="scroll-mt-6">
        <CanonicalSourceView projectId={projectId} />
      </div>
      <div id="documentation-review" className="scroll-mt-6">
        <CategoryReviewList projectId={projectId} />
      </div>
      <div id="documentation-editorial" className="scroll-mt-6">
        <EditorialProfileSettings projectId={projectId} />
      </div>
      <div id="documentation-client" className="scroll-mt-6">
        <ClientContentPreview projectId={projectId} />
      </div>
    </div>
  );
}
