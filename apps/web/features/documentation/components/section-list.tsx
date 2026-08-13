"use client";

import { useState } from "react";
import { LoaderCircle, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SectionView } from "schemas";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useComposeSection, useSections } from "../hooks";
import { DeleteSectionDialog } from "./delete-section-dialog";
import { SectionEditorDialog } from "./section-editor-dialog";
import { SectionProposalReview } from "./section-proposal-review";

// What the contributor needs to know at a glance is what to do next, so the
// state is derived from the section rather than shown as four raw flags.
function stateOf(section: SectionView) {
  if (section.activeProposal?.status === "composing") return "composing";
  if (section.activeProposal?.status === "pending_review") return "awaiting";
  if (section.refreshNeeded && section.hasPublishedContent) return "stale";
  if (section.refreshNeeded) return "never";
  return "published";
}

// Exactly one of these states asks something of the contributor, and periwinkle
// is the only colour allowed to say so (DESIGN.md, One Voice Rule). The rest
// stay on the muted surface: down a list of eight sections, the point is that
// the one waiting on a decision is the only thing that catches the eye.
const STATE_TONE: Record<ReturnType<typeof stateOf>, string> = {
  awaiting: "bg-primary/15 text-primary",
  composing: "bg-muted text-muted-foreground",
  stale: "bg-muted text-muted-foreground",
  never: "bg-muted text-muted-foreground",
  published: "bg-muted text-muted-foreground",
};

export function SectionList({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.Documentation.Sections");
  const sections = useSections(projectId);
  const compose = useComposeSection(projectId);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SectionView | undefined>();
  const [deleting, setDeleting] = useState<SectionView | undefined>();

  const rows = sections.data?.sections ?? [];

  return (
    <section className="mb-10">
      <div className="mb-6">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("listTitle")}
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {t("listDescription")}
        </p>
      </div>

      {sections.isPending ? (
        <div className="space-y-4" aria-busy="true" aria-label={t("loading")}>
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : sections.isError ? (
        // A failed fetch is not an empty project. Falling through to the empty
        // state below told a contributor with eight published sections that
        // they had none — a different, and wrong, fact.
        <p role="alert" className="text-sm text-destructive">
          {t("loadError")}
        </p>
      ) : rows.length === 0 ? (
        // FR-005: a project starts with no sections, and the area says so
        // plainly rather than showing an empty list.
        <div className="rounded-xl border border-dashed border-border p-6">
          <p className="text-sm text-muted-foreground">{t("emptyTitle")}</p>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {t("emptyDescription")}
          </p>
          <Button
            type="button"
            className="mt-4"
            onClick={() => setCreating(true)}
          >
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
            return (
              <article
                key={section.id}
                className={
                  state === "awaiting"
                    ? "rounded-xl border border-primary/40 bg-primary/[0.04] p-5"
                    : "rounded-xl border border-border bg-card p-5"
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold">{section.name}</h3>
                    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      {section.instructions}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${STATE_TONE[state]}`}
                  >
                    {state === "composing" && (
                      <LoaderCircle
                        aria-hidden
                        className="size-3 animate-spin motion-reduce:animate-none"
                      />
                    )}
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
                    onClick={() => setDeleting(section)}
                  >
                    <Trash2 />
                    {t("delete")}
                  </Button>
                </div>

                <div className="mt-5 border-t border-border pt-5">
                  <SectionProposalReview
                    projectId={projectId}
                    section={section}
                  />
                </div>
              </article>
            );
          })}

          <Button
            type="button"
            variant="outline"
            onClick={() => setCreating(true)}
          >
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
      {deleting && (
        <DeleteSectionDialog
          key={deleting.id}
          projectId={projectId}
          section={deleting}
          open
          onOpenChange={(open) => !open && setDeleting(undefined)}
        />
      )}
    </section>
  );
}
