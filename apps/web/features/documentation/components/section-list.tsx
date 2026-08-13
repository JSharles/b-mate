"use client";

import { useState } from "react";
import { LoaderCircle, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SectionView } from "schemas";
import { Button } from "@/shared/components/ui/button";
import { useArchiveSection, useComposeSection, useSections } from "../hooks";
import { SectionEditorDialog } from "./section-editor-dialog";
import { SectionProposalReview } from "./section-proposal-review";
import { StepHeading } from "./step-heading";

// What the contributor needs to know at a glance is what to do next, so the
// state is derived from the section rather than shown as four raw flags.
function stateOf(section: SectionView) {
  if (section.activeProposal?.status === "composing") return "composing";
  if (section.activeProposal?.status === "pending_review") return "awaiting";
  if (section.refreshNeeded && section.hasPublishedContent) return "stale";
  if (section.refreshNeeded) return "never";
  return "published";
}

export function SectionList({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.Documentation.Sections");
  const sections = useSections(projectId);
  const compose = useComposeSection(projectId);
  const archive = useArchiveSection(projectId);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SectionView | undefined>();

  const rows = sections.data?.sections ?? [];

  return (
    <section className="mb-10">
      <StepHeading
        step={2}
        namespace="Projects.Documentation.Steps"
        titleKey="title2"
        purposeKey="purpose2"
      />

      {sections.isPending ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : rows.length === 0 ? (
        // FR-005: a project starts with no sections, and the area says so
        // plainly rather than showing an empty list.
        <div className="rounded-xl border border-dashed border-border p-6">
          <p className="text-sm text-muted-foreground">{t("emptyTitle")}</p>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {t("emptyDescription")}
          </p>
          <Button type="button" className="mt-4" onClick={() => setCreating(true)}>
            <Plus />
            {t("createFirst")}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((section) => {
            const state = stateOf(section);
            // One mutation object serves every row, so `isPending` alone would
            // disable all of them the moment any one is clicked. The pending
            // section is the one the mutation was called with.
            const busy = compose.isPending && compose.variables === section.id;
            const removing = archive.isPending && archive.variables === section.id;
            return (
              <article
                key={section.id}
                className="rounded-xl border border-border bg-card p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{section.name}</h3>
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      {section.instructions}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                    {t(`state_${state}`)}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {state !== "composing" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => compose.mutate(section.id)}
                      disabled={busy}
                    >
                      {busy ? (
                        <LoaderCircle className="animate-spin motion-reduce:animate-none" />
                      ) : (
                        <RefreshCw />
                      )}
                      {section.hasPublishedContent ? t("refresh") : t("compose")}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(section)}
                  >
                    {t("edit")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => archive.mutate(section.id)}
                    disabled={removing}
                  >
                    <Trash2 />
                    {t("delete")}
                  </Button>
                </div>

                <div className="mt-5 border-t border-border pt-5">
                  <SectionProposalReview projectId={projectId} section={section} />
                </div>
              </article>
            );
          })}

          <Button type="button" variant="outline" onClick={() => setCreating(true)}>
            <Plus />
            {t("createAnother")}
          </Button>
        </div>
      )}

      <SectionEditorDialog
        projectId={projectId}
        open={creating}
        onOpenChange={setCreating}
      />
      {editing && (
        <SectionEditorDialog
          key={editing.id}
          projectId={projectId}
          section={editing}
          open
          onOpenChange={(open) => !open && setEditing(undefined)}
        />
      )}
    </section>
  );
}
