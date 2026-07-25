import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";

interface ComingSoonCardProps {
  icon: LucideIcon;
  title: string;
  message?: string;
  // Small tile — icon + title only, no message. Used for a set of several
  // not-yet-built sections shown together (see the client project page's
  // resource grid), so each stays its own distinct card without any one of
  // them claiming a full row. Fills its grid cell's height (h-full) rather
  // than forcing a square aspect ratio, so the surrounding grid controls it.
  compact?: boolean;
  // One-line explanation of what this section will eventually show — a
  // compact tile has no room for `message`'s body text, so this fills the
  // same "what is this" gap via a native hover tooltip plus screen-reader
  // text, instead of leaving a client to guess at an unexplained icon.
  hint?: string;
  className?: string;
}

export function ComingSoonCard({
  icon: Icon,
  title,
  message,
  compact = false,
  hint,
  className,
}: ComingSoonCardProps) {
  if (compact) {
    return (
      <Card title={hint} className={cn("h-full min-h-0 border-dashed", className)}>
        <CardContent className="flex h-full flex-col items-center justify-center gap-1.5 p-2 text-center">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <CardTitle>
            <h2 className="text-xs font-medium text-wrap text-muted-foreground">{title}</h2>
          </CardTitle>
          {hint && <span className="sr-only">{hint}</span>}
        </CardContent>
      </Card>
    );
  }

  return (
    // min-h-0 overrides the CSS Grid default (grid items get an implicit
    // min-height: auto, so their content's natural height wins over a
    // track sized by the parent's flex-1 — the same class of bug as the
    // flex min-height:auto gotcha already fixed in the protected layout,
    // just on the grid axis this time). Without it this card renders
    // taller than the row it's placed in and eats into the page's bottom
    // padding. overflow-hidden + CardContent's own overflow-y-auto clip at
    // the card boundary instead, matching the Team card's pattern.
    <Card className={cn("h-full min-h-0 overflow-hidden border-dashed", className)}>
      <CardHeader>
        <CardTitle>
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {title}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 items-center gap-2 overflow-y-auto text-sm text-muted-foreground">
        <Icon className="size-4 shrink-0" />
        {message}
      </CardContent>
    </Card>
  );
}
