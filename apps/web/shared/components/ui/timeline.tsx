import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

// A rail with markers on it. Written here rather than installed: the whole
// component is a border, a dot and a row, and the library offering it brought a
// second headless-primitive package for one polymorphic `render` prop nothing
// in this product needs.
//
// The One Voice Rule decides the palette (DESIGN.md). Periwinkle marks exactly
// one node — where the project stands — because that is the only thing on a
// roadmap that asks anything of the reader. What is done is solid and quiet,
// what is ahead is hollow, and a phase merely on offer is dashed.

export type MilestoneState = "done" | "current" | "ahead" | "offered";

const MARKER: Record<MilestoneState, string> = {
  // Muted rather than a dimmed off-white: at twelve pixels, half-opacity body
  // text sits at almost the same brightness as the periwinkle beside it, and
  // the eye had only the ring to tell "done" from "where we are".
  done: "border-muted-foreground bg-muted-foreground",
  current: "border-primary bg-primary ring-4 ring-primary/20",
  ahead: "border-border bg-background",
  // Lighter than a milestone, and no dashes: a dashed ring at this size reads
  // as a spinner, which is exactly the wrong thing to say about a phase that is
  // merely on offer.
  offered: "scale-50 border-muted-foreground/50 bg-transparent",
};

export function Timeline({ className, ...props }: ComponentProps<"ol">) {
  return <ol className={cn("relative", className)} {...props} />;
}

export function TimelineItem({
  state,
  marker,
  last = false,
  className,
  children,
  ...props
}: Omit<ComponentProps<"li">, "children"> & {
  state: MilestoneState;
  /** Replaces the dot when the marker itself is the control, as it is when the
   *  developer moves where the project stands. */
  marker?: ReactNode;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <li
      className={cn(
        "relative pl-8",
        // A phase on offer is one line, so it sits closer to the next than a
        // milestone carrying a date, a title and a sentence does.
        last ? "pb-0" : state === "offered" ? "pb-3" : "pb-6",
        className,
      )}
      {...props}
    >
      {/* The rail runs from under this marker to the next one, so the last item
          carries no trailing line into empty space. */}
      {!last && (
        <span
          aria-hidden="true"
          className="absolute left-[5px] top-5 bottom-0 w-px bg-border"
        />
      )}
      {marker ?? <TimelineMarker state={state} />}
      {children}
    </li>
  );
}

export function TimelineMarker({
  state,
  className,
}: {
  state: MilestoneState;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute left-0 top-1.5 size-3 rounded-full border-2",
        MARKER[state],
        className,
      )}
    />
  );
}

export { MARKER as TIMELINE_MARKER };
