"use client";

import { useTranslations } from "next-intl";
import type { PublicMilestone } from "schemas";
import {
  Timeline,
  TimelineItem,
  TimelineMarker,
  type MilestoneState,
} from "@/shared/components/ui/timeline";
import { cn } from "@/shared/lib/utils";

// What the client reads, and what the developer is shown under "what your
// client reads" — the same component, so the preview cannot drift from the
// thing. The answer to "where are we?" comes from the shape before a word is
// read: one node carries the accent, everything before it is solid, everything
// after is hollow.
//
// A roadmap claiming no position is a real state, not a bug — then nothing is
// marked and the whole plan reads as ahead, which is honest.

// Where the project stands may name a milestone or one of its sub-steps.
// Resolved once, here, so "the phase in progress" and "the step in progress"
// can never disagree: a milestone holding the current sub-step is the phase
// under way, and everything before it — sub-steps included — is done.
function positionOf(milestones: PublicMilestone[], currentId: string | null) {
  if (!currentId) return { milestone: -1, substep: -1 };
  const direct = milestones.findIndex((milestone) => milestone.id === currentId);
  if (direct !== -1) return { milestone: direct, substep: -1 };
  for (const [index, milestone] of milestones.entries()) {
    const substep = milestone.substeps.findIndex(
      (candidate) => candidate.id === currentId,
    );
    if (substep !== -1) return { milestone: index, substep };
  }
  return { milestone: -1, substep: -1 };
}

export function ClientTimeline({
  milestones,
  currentMilestoneId,
  onSelect,
}: {
  milestones: PublicMilestone[];
  currentMilestoneId: string | null;
  /** Given on the developer's side, where the marker is the control that moves
   *  where the project stands. The client's markers are not buttons. */
  onSelect?: (milestoneId: string | null) => void;
}) {
  const t = useTranslations("Projects.Documentation.Sections.Roadmap");
  const position = positionOf(milestones, currentMilestoneId);

  function stateOf(index: number): MilestoneState {
    if (position.milestone === -1) return "ahead";
    if (index < position.milestone) return "done";
    if (index === position.milestone) return "current";
    return "ahead";
  }

  // Inside the milestone under way, the sub-steps carry the position between
  // them. Inside any other milestone they take its state whole: every step of a
  // finished phase is finished.
  function substepStateOf(
    milestoneIndex: number,
    substepIndex: number,
  ): MilestoneState {
    if (milestoneIndex !== position.milestone) return stateOf(milestoneIndex);
    if (position.substep === -1) return "ahead";
    if (substepIndex < position.substep) return "done";
    if (substepIndex === position.substep) return "current";
    return "ahead";
  }

  function marker(id: string, state: MilestoneState, className?: string) {
    const isCurrent = state === "current";
    if (!onSelect) return undefined;
    return (
      <button
        type="button"
        aria-pressed={isCurrent}
        onClick={() => onSelect(isCurrent ? null : id)}
        className={cn(
          "absolute left-0 top-1.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
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
    );
  }

  return (
    <Timeline orientation="horizontal">
      {milestones.map((milestone, index) => {
        const state = stateOf(index);
        return (
          <TimelineItem
            key={milestone.id}
            state={state}
            orientation="horizontal"
            last={index === milestones.length - 1}
            marker={marker(milestone.id, state, "sm:top-0")}
          >
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {milestone.when}
            </p>
            <p className="font-medium">{milestone.title}</p>
            {milestone.description && (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {milestone.description}
              </p>
            )}

            {/* What sits inside the phase, quieter than the phase itself: a
                list under it rather than a second rail, because two rails would
                read as two roadmaps. */}
            {milestone.substeps.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {milestone.substeps.map((substep, substepIndex) => {
                  const substepState = substepStateOf(index, substepIndex);
                  return (
                    <li
                      key={substep.id}
                      className="relative flex items-baseline gap-2 pl-4"
                    >
                      {marker(substep.id, substepState, "top-1 scale-75") ?? (
                        <TimelineMarker
                          state={substepState}
                          className="top-1 size-2 scale-75"
                        />
                      )}
                      <span
                        className={cn(
                          "text-sm",
                          substepState === "current"
                            ? "text-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {substep.title}
                        {substep.when && (
                          <span className="ml-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                            {substep.when}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </TimelineItem>
        );
      })}
    </Timeline>
  );
}
