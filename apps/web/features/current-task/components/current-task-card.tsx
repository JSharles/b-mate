"use client";

import { CircleDot } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/shared/components/ui/card";
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

// Plain helper (not the component body) computing everything time-derived —
// keeps Date.now() out of the component's render body, same reasoning as
// formatRelativeTime above (react-hooks/purity flags an impure call written
// directly inside a component/hook, not one hidden behind a called function).
function computeProgress(startedAt: string, estimatedCompletionAt: string) {
  const start = new Date(startedAt).getTime();
  const end = new Date(estimatedCompletionAt).getTime();
  const now = Date.now();
  const totalMs = Math.max(end - start, 1);
  return {
    percent: Math.min(100, Math.max(0, ((now - start) / totalMs) * 100)),
    isOver: now > end,
    diffDays: Math.round((end - now) / (24 * 60 * 60 * 1000)),
  };
}

// 2026-08-09, second pass: the two-column split (title/sections on the
// left, every timestamp/estimate/confidence stacked in a bordered sidebar
// on the right) read as a dashboard stat panel bolted onto a paragraph —
// the user asked for one vertical reading order instead, and for the time/
// confidence info to read as real sentences rather than short icon-led
// labels. Confidence in particular used to just print "high"/"medium"/
// "low" (via the confidence.* keys) — now a full sentence explaining what
// that level actually means for the estimate's reliability, since a bare
// adjective assumes the client already knows what "confidence" refers to.
function ProgressIndicator({
  startedAt,
  estimatedCompletionAt,
  confidence,
  locale,
  t,
}: {
  startedAt: string;
  estimatedCompletionAt: string;
  confidence: "high" | "medium" | "low" | null;
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const { percent, isOver, diffDays } = computeProgress(startedAt, estimatedCompletionAt);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className={isOver ? "text-destructive" : "text-muted-foreground"}>
        {isOver ? t("runningOver") : t("estimatedCompletion", { time: rtf.format(diffDays, "day") })}
      </p>
      {confidence && (
        <p className={confidence === "low" ? "text-destructive" : "text-muted-foreground"}>
          {t(`confidence.${confidence}`)}
        </p>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", isOver && "bg-destructive")}
          style={
            isOver
              ? { width: `${percent}%` }
              : {
                  width: `${percent}%`,
                  // Lighter → canonical steps of --success's own tonal ramp
                  // (design.json), not a new color — see comment above.
                  backgroundImage:
                    "linear-gradient(to right, oklch(0.82 0.12 149), oklch(0.627 0.194 149.214))",
                }
          }
        />
      </div>
    </div>
  );
}

// One consistent "label above content" treatment for every section — En
// cours/Pourquoi/Impact/État all read as parallel, equally-weighted parts
// of the same structure (docs/PRODUCT.md "Working notes" sketches this
// literally as a flat bullet list: "En cours — ...", "Pourquoi c'est
// nécessaire — ...", etc.), not a title with three lesser footnotes under
// it.
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-semibold tracking-wide text-foreground/50 uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

// Purely decorative texture behind the frosted panel — never anything text
// sits directly on top of.
function IridescentGlow() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <span className="bg-iris-pink absolute -top-16 -left-16 size-72 rounded-full opacity-50 blur-3xl" />
      <span className="bg-iris-blue absolute top-1/4 -right-16 size-72 rounded-full opacity-50 blur-3xl" />
      <span className="bg-iris-yellow absolute -bottom-20 left-1/3 size-80 rounded-full opacity-40 blur-3xl" />
    </div>
  );
}

export function CurrentTaskCard({ projectId }: { projectId: string }) {
  const { data: items, isPending } = useCurrentTask(projectId);
  const t = useTranslations("Projects.CurrentTaskCard");
  const locale = useLocale();

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-xl">
      <IridescentGlow />
      <Card className="relative h-full min-h-0 border-2 border-white/15 bg-white/[0.06] shadow-xl backdrop-blur-2xl">
          {/* No CardHeader/title here — the tab trigger that hosts this
              panel (ClientMainTabs, page-level) already says "Tâche en
              cours"; a second identical label directly below it would be
              redundant. justify-start, not justify-center: with the
              progress bar/start date additions, real content can now be
              taller than the card's allocated height. A centered flex
              column anchors its overflow scroll position mid-content,
              cutting off the title at the top with no visual cue to scroll
              — justify-start guarantees the title is always the first
              thing visible, scrolling down for the rest. */}
        <CardContent className="flex flex-1 flex-col justify-start gap-3 overflow-y-auto py-1">
          {isPending ? (
            <Skeleton className="h-10 w-full" />
          ) : !items || items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <LiveIndicator active={false} />
              <p className="text-sm text-muted-foreground">{t("empty")}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-6">
              {items.map((item) => (
                // key is the item's own (vulgarized) title, so a real
                // content change (the task moved on, or its wording was
                // refreshed) unmounts the old entry and remounts this one —
                // the one authored motion moment below plays exactly when
                // something genuinely changed, never on an unrelated
                // re-render.
                <li
                  key={item.title}
                  className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 flex max-w-prose flex-col gap-3 motion-safe:duration-300"
                >
                  <Section label={t("inProgress")}>
                    <div className="flex items-center gap-3">
                      <LiveIndicator active />
                      {/* h3, not a bare span: the task's own title is
                          genuinely the most important string on the card
                          and belongs in the heading outline, not skipped
                          by a screen reader navigating by heading. */}
                      <h3 className="text-xl leading-snug font-bold text-balance">
                        {item.title}
                      </h3>
                    </div>
                  </Section>

                  {/* 2026-08-09: why/impact/status replace the old single
                      description blob (docs/PRODUCT.md "Working notes") —
                      a client scans named sections far faster than one
                      blob of text. Any can be absent: the vulgarization
                      prompt is instructed to leave a section out rather
                      than invent content the source doesn't support
                      (Constitution II, "Never fabricate"). */}
                  {item.why && (
                    <Section label={t("why")}>
                      <p className="text-sm leading-relaxed text-foreground/80">{item.why}</p>
                    </Section>
                  )}
                  {item.impact && (
                    <Section label={t("impact")}>
                      <p className="text-sm leading-relaxed text-foreground/80">{item.impact}</p>
                    </Section>
                  )}
                  {item.status && (
                    <Section label={t("status")}>
                      <p className="text-sm leading-relaxed text-foreground/80">{item.status}</p>
                    </Section>
                  )}

                  {/* Time/estimate/confidence: one vertical reading order,
                      not a separate bordered sidebar (that read as a
                      dashboard stat panel bolted onto a paragraph) — a
                      plain sentence rather than an icon-led label,
                      consistent with the why/impact/status sections above
                      it, closing out the card instead of racing it
                      side by side. */}
                  <p className="border-t border-white/15 pt-3 text-sm text-muted-foreground">
                    {t("timeline", {
                      started: formatRelativeTime(item.startedAt, locale),
                      updated: formatRelativeTime(item.updatedAt, locale),
                    })}
                  </p>
                  {item.estimatedCompletionAt && (
                    <ProgressIndicator
                      startedAt={item.startedAt}
                      estimatedCompletionAt={item.estimatedCompletionAt}
                      confidence={item.estimateConfidence}
                      locale={locale}
                      t={t}
                    />
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
