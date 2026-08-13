"use client";

import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { MilestoneDraft, SectionView } from "schemas";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Timeline,
  TimelineItem,
  TimelineMarker,
  type MilestoneState,
} from "@/shared/components/ui/timeline";
import { cn } from "@/shared/lib/utils";
import { useReplaceMilestones, useSetCurrentMilestone } from "../hooks";
import { ROADMAP_PHASE_IDS } from "./roadmap-phases";

// A draft milestone as the screen holds it. `id` is null for one the developer
// added, which is what tells the API to mint an id rather than look for one.
type Draft = MilestoneDraft & { key: string };

// Structural rather than the `Milestone` type: the published roadmap carries
// the same four fields without `origin`, which is the developer's business and
// never the client's.
type ReadMilestone = {
  id: string;
  when: string;
  title: string;
  description: string | null;
};

function toDraft(milestone: ReadMilestone): Draft {
  return {
    key: milestone.id,
    id: milestone.id,
    when: milestone.when,
    title: milestone.title,
    description: milestone.description,
  };
}

function blank(title = "", when = ""): Draft {
  return {
    key: `new-${Math.random().toString(36).slice(2)}`,
    id: null,
    when,
    title,
    description: null,
  };
}

// No edit mode, no pencil, no dialog: the roadmap is the form. Typing in a
// milestone changes it, and the one button that appears is the one that has
// something to save.
const fieldClass =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1 outline-none transition-colors hover:border-border focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function RoadmapEditor({
  projectId,
  section,
  milestones,
  proposalVersion,
  editable,
}: {
  projectId: string;
  section: SectionView;
  milestones: ReadMilestone[];
  /** Absent when the roadmap on screen is the published one, which is read
   *  only — everything except where the project stands. */
  proposalVersion?: number;
  editable: boolean;
}) {
  const t = useTranslations("Projects.Documentation.Sections.Roadmap");
  const save = useReplaceMilestones(projectId, section.id);
  const move = useSetCurrentMilestone(projectId, section.id);

  // Keyed on the version so a fresh composition replaces the draft instead of
  // being masked by edits made against the previous one.
  const [revision, setRevision] = useState(proposalVersion);
  const [draft, setDraft] = useState<Draft[]>(() => milestones.map(toDraft));
  if (revision !== proposalVersion) {
    setRevision(proposalVersion);
    setDraft(milestones.map(toDraft));
  }

  const rows = editable ? draft : milestones.map(toDraft);
  // Guarded on the section actually naming one: a milestone the developer has
  // just added carries no id either, and `null === null` had every new step
  // marking itself as where the project stands.
  const currentIndex = section.currentMilestoneId
    ? rows.findIndex((row) => row.id === section.currentMilestoneId)
    : -1;

  const dirty =
    editable &&
    (draft.length !== milestones.length ||
      draft.some((row, index) => {
        const original = milestones[index];
        return (
          !original ||
          original.id !== row.id ||
          original.when !== row.when ||
          original.title !== row.title ||
          (original.description ?? "") !== (row.description ?? "")
        );
      }));

  function patch(key: string, changes: Partial<MilestoneDraft>) {
    setDraft((current) =>
      current.map((row) => (row.key === key ? { ...row, ...changes } : row)),
    );
  }

  function swap(index: number, delta: number) {
    setDraft((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  // A phase already on the timeline stops being offered: what it would add is
  // already there.
  const taken = new Set(rows.map((row) => row.title.trim().toLowerCase()));
  const offered = ROADMAP_PHASE_IDS.map((id) => t(`phase_${id}`)).filter(
    (name) => !taken.has(name.trim().toLowerCase()),
  );

  function stateOf(index: number): MilestoneState {
    if (currentIndex === -1) return "ahead";
    if (index < currentIndex) return "done";
    if (index === currentIndex) return "current";
    return "ahead";
  }

  return (
    <div className="max-w-[68ch] space-y-6">
      <Timeline>
        {rows.map((row, index) => {
          const state = stateOf(index);
          const isCurrent = state === "current";
          return (
            <TimelineItem
              key={row.key}
              state={state}
              last={index === rows.length - 1}
              className="group"
              marker={
                // The dot is where the project stands, so the dot is the
                // control that moves it. Only a saved milestone can be named:
                // one that exists nowhere yet has no id to point at.
                row.id ? (
                  <button
                    type="button"
                    aria-pressed={isCurrent}
                    disabled={move.isPending}
                    onClick={() =>
                      move.mutate({
                        milestoneId: isCurrent ? null : row.id,
                        expectedVersion: section.version,
                      })
                    }
                    className="absolute left-0 top-1.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <TimelineMarker
                      state={state}
                      className={cn(
                        "static block transition-colors",
                        !isCurrent && "hover:border-primary",
                      )}
                    />
                    <span className="sr-only">
                      {isCurrent ? t("clearPosition") : t("markPosition")}
                    </span>
                  </button>
                ) : undefined
              }
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  {editable ? (
                    <>
                      <input
                        value={row.when}
                        onChange={(event) =>
                          patch(row.key, { when: event.target.value })
                        }
                        maxLength={120}
                        placeholder={t("whenPlaceholder")}
                        aria-label={t("whenLabel")}
                        className={cn(
                          fieldClass,
                          "-ml-2 text-xs uppercase tracking-wide text-muted-foreground",
                        )}
                      />
                      <input
                        value={row.title}
                        onChange={(event) =>
                          patch(row.key, { title: event.target.value })
                        }
                        maxLength={200}
                        placeholder={t("titlePlaceholder")}
                        aria-label={t("titleLabel")}
                        className={cn(fieldClass, "-ml-2 font-medium")}
                      />
                      <textarea
                        value={row.description ?? ""}
                        onChange={(event) =>
                          patch(row.key, {
                            description: event.target.value || null,
                          })
                        }
                        rows={2}
                        maxLength={2000}
                        placeholder={t("descriptionPlaceholder")}
                        aria-label={t("descriptionLabel")}
                        className={cn(
                          fieldClass,
                          "-ml-2 resize-y text-sm leading-relaxed text-muted-foreground",
                        )}
                      />
                    </>
                  ) : (
                    <>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {row.when}
                      </p>
                      <p className="font-medium">{row.title}</p>
                      {row.description && (
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                          {row.description}
                        </p>
                      )}
                    </>
                  )}
                </div>

                {editable && (
                  <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === 0}
                      onClick={() => swap(index, -1)}
                    >
                      <ChevronUp />
                      <span className="sr-only">{t("moveUp")}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === rows.length - 1}
                      onClick={() => swap(index, 1)}
                    >
                      <ChevronDown />
                      <span className="sr-only">{t("moveDown")}</span>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setDraft((current) =>
                          current.filter((entry) => entry.key !== row.key),
                        )
                      }
                    >
                      <X />
                      <span className="sr-only">{t("remove")}</span>
                    </Button>
                  </div>
                )}
              </div>
            </TimelineItem>
          );
        })}

      </Timeline>

      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          {/* One control, and the arc every project runs through lives inside
              it. Laid out on the rail the phases looked like steps the roadmap
              already had; here they are what they are — ways of adding one. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2 text-muted-foreground"
              >
                <Plus />
                {t("addStep")}
                <ChevronDown className="opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {offered.map((name) => (
                <DropdownMenuItem
                  key={name}
                  onSelect={() =>
                    setDraft((current) => [...current, blank(name)])
                  }
                >
                  {name}
                </DropdownMenuItem>
              ))}
              {offered.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onSelect={() => setDraft((current) => [...current, blank()])}
              >
                {t("addBlankStep")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {dirty && (
            <Button
              type="button"
              size="sm"
              disabled={
                save.isPending ||
                draft.some((row) => !row.title.trim() || !row.when.trim())
              }
              onClick={() =>
                save.mutate({
                  milestones: draft.map((row) => ({
                    id: row.id,
                    when: row.when.trim(),
                    title: row.title.trim(),
                    description: row.description?.trim() || null,
                  })),
                  expectedProposalVersion: proposalVersion!,
                })
              }
            >
              {save.isPending ? t("saving") : t("save")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
