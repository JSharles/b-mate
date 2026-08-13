import type { PublicMilestone } from "schemas";
import {
  Timeline,
  TimelineItem,
  type MilestoneState,
} from "@/shared/components/ui/timeline";

// What the client reads. The answer to "where are we?" comes from the shape
// before a word is read: one node carries the accent, everything before it is
// solid, everything after is hollow.
//
// A roadmap claiming no position is a real state, not a bug — then nothing is
// marked and the whole plan reads as ahead, which is honest.
export function ClientTimeline({
  milestones,
  currentMilestoneId,
}: {
  milestones: PublicMilestone[];
  currentMilestoneId: string | null;
}) {
  const currentIndex = milestones.findIndex(
    (milestone) => milestone.id === currentMilestoneId,
  );

  function stateOf(index: number): MilestoneState {
    if (currentIndex === -1) return "ahead";
    if (index < currentIndex) return "done";
    if (index === currentIndex) return "current";
    return "ahead";
  }

  return (
    <Timeline className="max-w-[68ch]">
      {milestones.map((milestone, index) => (
        <TimelineItem
          key={milestone.id}
          state={stateOf(index)}
          last={index === milestones.length - 1}
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
      ))}
    </Timeline>
  );
}
