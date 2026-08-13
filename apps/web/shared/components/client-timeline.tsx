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
  const currentIndex = currentMilestoneId
    ? milestones.findIndex((milestone) => milestone.id === currentMilestoneId)
    : -1;

  function stateOf(index: number): MilestoneState {
    if (currentIndex === -1) return "ahead";
    if (index < currentIndex) return "done";
    if (index === currentIndex) return "current";
    return "ahead";
  }

  return (
    <Timeline orientation="horizontal">
      {milestones.map((milestone, index) => {
        const state = stateOf(index);
        const isCurrent = state === "current";
        return (
          <TimelineItem
            key={milestone.id}
            state={state}
            orientation="horizontal"
            last={index === milestones.length - 1}
            marker={
              onSelect ? (
                <button
                  type="button"
                  aria-pressed={isCurrent}
                  onClick={() => onSelect(isCurrent ? null : milestone.id)}
                  className="absolute left-0 top-1.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:top-0"
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
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {milestone.when}
            </p>
            <p className="font-medium">{milestone.title}</p>
            {milestone.description && (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {milestone.description}
              </p>
            )}
          </TimelineItem>
        );
      })}
    </Timeline>
  );
}
