"use client";

import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { MilestoneDraft, SectionView, SubstepDraft } from "schemas";
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
import { ClientTimeline } from "@/shared/components/client-timeline";
import { cn } from "@/shared/lib/utils";
import { useReplaceMilestones, useSetCurrentMilestone } from "../hooks";
import { ROADMAP_PHASE_IDS } from "./roadmap-phases";

// A draft as the screen holds it. `id` is null for one the developer added,
// which is what tells the API to mint an id rather than look for one. `key` is
// the screen's own handle, because a new step has no id to be keyed by.
type SubstepDraftRow = SubstepDraft & { key: string };
type Draft = Omit<MilestoneDraft, "substeps"> & {
  key: string;
  substeps: SubstepDraftRow[];
};

// Structural rather than the `Milestone` type: the published roadmap carries
// the same fields without `origin`, which is the developer's business and never
// the client's.
type ReadSubstep = {
  id: string;
  when: string | null;
  title: string;
  description: string | null;
};
type ReadMilestone = {
  id: string;
  when: string | null;
  title: string;
  description: string | null;
  substeps: ReadSubstep[];
};

function newKey() {
  return `new-${Math.random().toString(36).slice(2)}`;
}

function toDraft(milestone: ReadMilestone): Draft {
  return {
    key: milestone.id,
    id: milestone.id,
    when: milestone.when,
    title: milestone.title,
    description: milestone.description,
    substeps: milestone.substeps.map((substep) => ({
      key: substep.id,
      id: substep.id,
      when: substep.when,
      title: substep.title,
      description: substep.description,
    })),
  };
}

function blank(title = "", when: string | null = null): Draft {
  return { key: newKey(), id: null, when, title, description: null, substeps: [] };
}

function blankSubstep(): SubstepDraftRow {
  return { key: newKey(), id: null, when: null, title: "", description: null };
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

  // Nothing to edit means nothing to edit: what is shown is what the client
  // reads, rendered by the client's own component so the two cannot drift.
  // The marker stays a control, because where the project stands moves without
  // composing, approving or publishing anything.
  if (!editable) {
    // A published roadmap with nothing in it is absent from the client's tabs,
    // so saying "here is what they read" over a blank would be a lie.
    if (milestones.length === 0) {
      return <p className="text-sm text-muted-foreground">{t("nothingYet")}</p>;
    }
    return (
      <ClientTimeline
        milestones={milestones}
        currentMilestoneId={section.currentMilestoneId}
        onSelect={(milestoneId) =>
          move.mutate({ milestoneId, expectedVersion: section.version })
        }
      />
    );
  }

  const rows = draft;
  // Guarded on the section actually naming one: a milestone the developer has
  // just added carries no id either, and `null === null` had every new step
  // marking itself as where the project stands.
  const currentIndex = section.currentMilestoneId
    ? rows.findIndex((row) => row.id === section.currentMilestoneId)
    : -1;

  const dirty =
    draft.length !== milestones.length ||
    draft.some((row, index) => {
      const original = milestones[index];
      return (
        !original ||
        original.id !== row.id ||
        (original.when ?? "") !== (row.when ?? "") ||
        original.title !== row.title ||
        (original.description ?? "") !== (row.description ?? "") ||
        original.substeps.length !== row.substeps.length ||
        row.substeps.some((substep, substepIndex) => {
          const originalSubstep = original.substeps[substepIndex];
          return (
            !originalSubstep ||
            originalSubstep.id !== substep.id ||
            (originalSubstep.when ?? "") !== (substep.when ?? "") ||
            originalSubstep.title !== substep.title
          );
        })
      );
    });

  // Never `substeps`: those go through `setSubsteps`, which keeps the screen's
  // own key on each row so a step with no id yet still has a stable handle.
  function patch(key: string, changes: Partial<Omit<MilestoneDraft, "substeps">>) {
    setDraft((current) =>
      current.map((row) => (row.key === key ? { ...row, ...changes } : row)),
    );
  }

  function patchSubstep(
    milestoneKey: string,
    substepKey: string,
    changes: Partial<Omit<SubstepDraft, "id">>,
  ) {
    setDraft((current) =>
      current.map((row) =>
        row.key === milestoneKey
          ? {
              ...row,
              substeps: row.substeps.map((substep) =>
                substep.key === substepKey
                  ? { ...substep, ...changes }
                  : substep,
              ),
            }
          : row,
      ),
    );
  }

  function setSubsteps(
    milestoneKey: string,
    update: (substeps: SubstepDraftRow[]) => SubstepDraftRow[],
  ) {
    setDraft((current) =>
      current.map((row) =>
        row.key === milestoneKey
          ? { ...row, substeps: update(row.substeps) }
          : row,
      ),
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
                      <input
                        value={row.when ?? ""}
                        onChange={(event) =>
                          patch(row.key, { when: event.target.value || null })
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

                  {/* What sits inside this step. A list under it rather than a
                      rail of its own: two rails would read as two roadmaps, and
                      the depth stops here. */}
                  <ul className="mt-2 space-y-1 border-l border-border/60 pl-3">
                    {row.substeps.map((substep, substepIndex) => (
                      <li
                        key={substep.key}
                        className="group/substep flex items-center gap-1"
                      >
                        {/* The dot is where the project stands, here too: "we
                            are on Feature 2" is the answer "Développement"
                            cannot give. Only a saved step can be named — one
                            that exists nowhere yet has no id to point at. */}
                        {substep.id ? (
                          <button
                            type="button"
                            aria-pressed={substep.id === section.currentMilestoneId}
                            disabled={move.isPending}
                            onClick={() =>
                              move.mutate({
                                milestoneId:
                                  substep.id === section.currentMilestoneId
                                    ? null
                                    : substep.id,
                                expectedVersion: section.version,
                              })
                            }
                            className="shrink-0 rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span
                              className={cn(
                                "block size-1.5 rounded-full transition-colors",
                                substep.id === section.currentMilestoneId
                                  ? "bg-primary ring-2 ring-primary/20"
                                  : "bg-muted-foreground/60 hover:bg-primary",
                              )}
                            />
                            <span className="sr-only">
                              {substep.id === section.currentMilestoneId
                                ? t("clearPosition")
                                : t("markPosition")}
                            </span>
                          </button>
                        ) : (
                          <span
                            aria-hidden="true"
                            className="size-1.5 shrink-0 rounded-full bg-muted-foreground/60"
                          />
                        )}
                        <input
                          value={substep.title}
                          onChange={(event) =>
                            patchSubstep(row.key, substep.key, {
                              title: event.target.value,
                            })
                          }
                          maxLength={200}
                          placeholder={t("substepTitlePlaceholder")}
                          aria-label={t("substepTitleLabel")}
                          className={cn(fieldClass, "text-sm")}
                        />
                        {/* A step inside a phase often has no date of its own,
                            so the field is narrow and empty is an answer. */}
                        <input
                          value={substep.when ?? ""}
                          onChange={(event) =>
                            patchSubstep(row.key, substep.key, {
                              when: event.target.value || null,
                            })
                          }
                          maxLength={120}
                          placeholder={t("substepWhenPlaceholder")}
                          aria-label={t("substepWhenLabel")}
                          className={cn(
                            fieldClass,
                            "w-28 shrink-0 text-xs uppercase tracking-wide text-muted-foreground",
                          )}
                        />
                        <div className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/substep:opacity-100">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={substepIndex === 0}
                            onClick={() =>
                              setSubsteps(row.key, (current) => {
                                const next = [...current];
                                [next[substepIndex - 1], next[substepIndex]] = [
                                  next[substepIndex],
                                  next[substepIndex - 1],
                                ];
                                return next;
                              })
                            }
                          >
                            <ChevronUp />
                            <span className="sr-only">{t("moveUp")}</span>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={substepIndex === row.substeps.length - 1}
                            onClick={() =>
                              setSubsteps(row.key, (current) => {
                                const next = [...current];
                                [next[substepIndex], next[substepIndex + 1]] = [
                                  next[substepIndex + 1],
                                  next[substepIndex],
                                ];
                                return next;
                              })
                            }
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
                              setSubsteps(row.key, (current) =>
                                current.filter(
                                  (entry) => entry.key !== substep.key,
                                ),
                              )
                            }
                          >
                            <X />
                            <span className="sr-only">{t("remove")}</span>
                          </Button>
                        </div>
                      </li>
                    ))}
                    <li>
                      {/* Inside the rule, aligned with the rows it extends and
                          carrying their bullet rather than a plus: it reads as
                          "one more of these", not as a second way to add a
                          step. The two controls were mistaken for each other. */}
                      <button
                        type="button"
                        onClick={() =>
                          setSubsteps(row.key, (current) => [
                            ...current,
                            blankSubstep(),
                          ])
                        }
                        className="flex items-center gap-2 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span
                          aria-hidden="true"
                          className="size-1.5 shrink-0 rounded-full border border-dashed border-muted-foreground/60"
                        />
                        {t("addSubstep")}
                      </button>
                    </li>
                  </ul>
                </div>

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
              </div>
            </TimelineItem>
          );
        })}
      </Timeline>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
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
                draft.some(
                  (row) =>
                    !row.title.trim() ||
                    row.substeps.some((substep) => !substep.title.trim()),
                )
              }
              onClick={() =>
                save.mutate({
                  milestones: draft.map((row) => ({
                    id: row.id,
                    when: row.when?.trim() || null,
                    title: row.title.trim(),
                    description: row.description?.trim() || null,
                    substeps: row.substeps.map((substep) => ({
                      id: substep.id,
                      when: substep.when?.trim() || null,
                      title: substep.title.trim(),
                      description: substep.description?.trim() || null,
                    })),
                  })),
                  expectedProposalVersion: proposalVersion!,
                })
              }
            >
              {save.isPending ? t("saving") : t("save")}
            </Button>
          )}
      </div>
    </div>
  );
}
