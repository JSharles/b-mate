"use client";

import { CircleDot } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import { useCurrentTask } from "../hooks";

// Signature Card treatment (DESIGN.md "Signature Card" exception) — reserved
// for this card because it's the core value proposition, not a pattern to
// copy onto ordinary cartouches. Reinforced per critique feedback (P0): the
// first pass measured as "basically white" in a real screenshot — this pass
// pushes opacity/scale/border hard enough to read as unmistakable at a glance.
//
// `active` distinguishes "a task is live" from "nothing in progress right
// now": a live-tested critique pass caught that the ring/pulse only ever
// rendered on the has-data branch, so an idle project (a very plausible
// first-session state for a real client) looked identical to every
// placeholder tile around it. Idle keeps the same glow/ring/dot elements —
// just dimmer and static — instead of vanishing, so the card still reads as
// "this is the important one," not "this one is broken."
function LiveIndicator({ active }: { active: boolean }) {
  return (
    <div className="relative flex size-9 shrink-0 items-center justify-center" aria-hidden>
      <span className="bg-glow/30 absolute inset-0 rounded-full blur-lg" />
      <span
        className={cn(
          "absolute inset-0 rounded-full",
          active && "motion-safe:animate-[spin_3s_linear_infinite]",
        )}
        style={{
          background: active
            ? "conic-gradient(from 0deg, var(--foreground) 0deg 90deg, transparent 90deg 360deg)"
            : "conic-gradient(from 0deg, var(--muted-foreground) 0deg 40deg, transparent 40deg 360deg)",
          WebkitMaskImage:
            "radial-gradient(farthest-side, transparent calc(100% - 2.5px), black calc(100% - 2.5px))",
          maskImage:
            "radial-gradient(farthest-side, transparent calc(100% - 2.5px), black calc(100% - 2.5px))",
        }}
      />
      <span className="relative flex size-6 items-center justify-center rounded-full bg-accent">
        <CircleDot className="size-4 text-accent-foreground" />
      </span>
      <span
        className={cn(
          "ring-card absolute -top-0.5 -right-0.5 size-3 rounded-full ring-2",
          active ? "bg-success motion-safe:animate-pulse" : "bg-muted-foreground/50",
        )}
      />
    </div>
  );
}

// Frontend-only relative-time formatting from the item's own `updatedAt`
// (backend already tracks this via VulgarizedTask.updatedAt — see
// specs/007-current-task-vulgarization) — no new backend contract to design,
// just surfacing what was already persisted. Answers the critique finding
// that nothing on this page tells an anxious client whether "in progress"
// means five minutes ago or three weeks ago.
function formatRelativeTime(isoDate: string, locale: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMinutes = Math.round(diffMs / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  if (Math.abs(diffMinutes) < 60) {
    return rtf.format(-diffMinutes, "minute");
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return rtf.format(-diffHours, "hour");
  }
  return rtf.format(-Math.round(diffHours / 24), "day");
}

// Purely decorative texture behind the frosted panel — never anything text
// sits directly on top of.
function IridescentGlow() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <span className="bg-iris-pink absolute -top-16 -left-16 size-72 rounded-full opacity-80 blur-3xl" />
      <span className="bg-iris-blue absolute top-1/4 -right-16 size-72 rounded-full opacity-80 blur-3xl" />
      <span className="bg-iris-yellow absolute -bottom-20 left-1/3 size-80 rounded-full opacity-70 blur-3xl" />
    </div>
  );
}

export function CurrentTaskCard({ projectId }: { projectId: string }) {
  const { data: items, isPending } = useCurrentTask(projectId);
  const t = useTranslations("Projects.CurrentTaskCard");
  const locale = useLocale();

  return (
    <div className="relative h-full overflow-hidden rounded-xl">
      <IridescentGlow />
      <Card className="relative h-full border-2 border-white/80 bg-white/50 shadow-xl backdrop-blur-2xl">
        <CardHeader>
          <CardTitle>
            <h2 className="text-sm font-bold tracking-wide text-foreground uppercase">
              {t("title")}
            </h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col justify-center gap-3 overflow-y-auto py-1">
          {isPending ? (
            <Skeleton className="h-10 w-full" />
          ) : !items || items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <LiveIndicator active={false} />
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {items.map((item) => (
                // key is the item's own (vulgarized) title, so a real
                // content change (the task moved on, or its wording was
                // refreshed) unmounts the old entry and remounts this one —
                // the one authored motion moment below plays exactly when
                // something genuinely changed, never on an unrelated
                // re-render.
                <li
                  key={item.title}
                  className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 flex flex-col gap-2 motion-safe:duration-300"
                >
                  <div className="flex items-start gap-3">
                    <LiveIndicator active />
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="text-xl leading-snug font-bold text-balance">
                        {item.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t("updatedAt", { time: formatRelativeTime(item.updatedAt, locale) })}
                      </span>
                    </div>
                  </div>
                  {item.description && (
                    <p className="pl-12 text-sm text-muted-foreground">{item.description}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
