import { CircleHelp } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PublicClientSection } from "schemas";
import { ClientTimeline } from "./client-timeline";

export function ClientSectionView({ section }: { section: PublicClientSection }) {
  const t = useTranslations("Projects.ClientMainTabs");

  // Order, dates and where the project stands are spatial facts, and a
  // paragraph hides all three (specs/020).
  if (section.kind === "roadmap") {
    return (
      <ClientTimeline
        milestones={section.milestones}
        currentMilestoneId={section.currentMilestoneId}
      />
    );
  }

  return (
    <div className="max-w-[68ch] space-y-4 text-base leading-[1.75]">
      {section.blocks.map((block, index) => {
        if (block.type === "bullet") {
          return (
            <div key={index} className="flex gap-2">
              <span aria-hidden="true">•</span>
              <p>{block.text}</p>
            </div>
          );
        }
        // Escalate rather than guess: what the project has not decided is shown
        // as undecided rather than smoothed into a sentence that reads as
        // settled. Unlabelled, the box only looked different without saying why.
        if (block.type === "open_point") {
          return (
            <div
              key={index}
              className="rounded-lg border border-border bg-muted p-4"
            >
              <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                <CircleHelp className="size-3.5" />
                {t("openPointLabel")}
              </p>
              <p className="mt-2 leading-7">{block.text}</p>
            </div>
          );
        }
        return (
          <p key={index} className="leading-7">
            {block.text}
          </p>
        );
      })}
    </div>
  );
}
