"use client";

import { LoaderCircle, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { SectionView } from "schemas";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/components/ui/tabs";
import { useComposeSection, useSections } from "../hooks";
import { DeleteSectionDialog } from "./delete-section-dialog";
import { SectionEditorDialog } from "./section-editor-dialog";
import { SectionProposalReview } from "./section-proposal-review";

export function stateOf(section: SectionView) {
  if (section.activeProposal?.status === "composing") return "composing";
  if (section.activeProposal?.status === "pending_review") return "awaiting";
  if (section.refreshNeeded && section.hasPublishedContent) return "stale";
  if (section.refreshNeeded) return "never";
  return "published";
}

// Exactly one of these states asks something of the developer, and periwinkle
// is the only colour allowed to say so (DESIGN.md, One Voice Rule).
const STATE_TONE: Record<ReturnType<typeof stateOf>, string> = {
  awaiting: "bg-primary/15 text-primary",
  composing: "bg-muted text-muted-foreground",
  stale: "bg-muted text-muted-foreground",
  never: "bg-muted text-muted-foreground",
  published: "bg-muted text-muted-foreground",
};

// The developer reads their documentation the way their client will — one
// rubrique per tab — with the actions the client does not get. A list of
// rubriques above a separate "client preview" said the same thing twice, and
// the list unfolded every proposal in full, so a project with three rubriques
// was thousands of pixels of scroll (specs/019).
export function SectionWorkspace({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects.Documentation.Sections");
  const sections = useSections(projectId);
  const compose = useComposeSection(projectId);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SectionView | undefined>();
  const [deleting, setDeleting] = useState<SectionView | undefined>();
  const [selected, setSelected] = useState<string | null>(null);

  const rows = sections.data?.sections ?? [];

  // Derived rather than synced: a rubrique the developer deleted, or one that
  // has not loaded yet, falls back to the first. Held in an effect instead,
  // every list refresh set state during render and cascaded.
  const active =
    selected && rows.some((row) => row.id === selected)
      ? selected
      : (rows[0]?.id ?? null);

  if (sections.isPending) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label={t("loading")}>
        <Skeleton className="h-10 w-96 rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  // A failed fetch is not an empty project. Falling through to the empty state
  // told a developer with eight published rubriques that they had none.
  if (sections.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {t("loadError")}
      </p>
    );
  }

  const addButton = (
    <Button
      type="button"
      variant={rows.length === 0 ? "default" : "outline"}
      onClick={() => setCreating(true)}
    >
      <Plus />
      {t(rows.length === 0 ? "createFirst" : "createAnother")}
    </Button>
  );

  return (
    <section aria-labelledby="sections-title">
      <div className="mb-6">
        <h2 id="sections-title" className="text-lg font-semibold tracking-tight">
          {t("listTitle")}
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {t("listDescription")}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6">
          <p className="text-sm text-muted-foreground">{t("emptyTitle")}</p>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {t("emptyDescription")}
          </p>
          <div className="mt-4">{addButton}</div>
        </div>
      ) : (
        <Tabs
          value={active ?? rows[0].id}
          onValueChange={setSelected}
          className="min-h-0"
        >
          <div className="flex flex-wrap items-center gap-3">
            <TabsList className="h-auto flex-wrap justify-start">
              {rows.map((section) => {
                const state = stateOf(section);
                return (
                  <TabsTrigger key={section.id} value={section.id}>
                    {section.name}
                    {/* The one rubrique waiting on a decision is the only thing
                        that should catch the eye down a row of eight. */}
                    <span
                      className={`ml-2 rounded px-1.5 py-0.5 text-xs ${STATE_TONE[state]}`}
                    >
                      {t(`state_${state}`)}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {addButton}
          </div>

          {rows.map((section) => {
            const state = stateOf(section);
            // One mutation object serves every tab, so `isPending` alone would
            // disable all of them the moment any one is clicked.
            const busy = compose.isPending && compose.variables === section.id;
            return (
              <TabsContent
                key={section.id}
                value={section.id}
                className="mt-6 min-h-0"
              >
                <div className="rounded-xl border border-border bg-card p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="text-lg font-semibold tracking-tight">
                        {section.name}
                      </h3>
                      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                        {section.instructions}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
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
                          {section.hasPublishedContent
                            ? t("refresh")
                            : t("compose")}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(section)}
                      >
                        <Pencil />
                        {t("edit")}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleting(section)}
                      >
                        <Trash2 />
                        {t("delete")}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-border pt-6">
                    <SectionProposalReview
                      projectId={projectId}
                      section={section}
                    />
                  </div>
                </div>
              </TabsContent>
            );
          })}
        </Tabs>
      )}

      <SectionEditorDialog
        projectId={projectId}
        open={creating}
        onOpenChange={setCreating}
        onCreated={setSelected}
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
