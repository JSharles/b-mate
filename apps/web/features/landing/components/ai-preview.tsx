import { useTranslations } from "next-intl";
import { ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/shared/lib/utils";

const TICKETS = [
  { key: "ticket1", tag: "chore" },
  { key: "ticket2", tag: "chore" },
  { key: "ticket3", tag: "bug" },
  { key: "ticket4", tag: "feature" },
] as const;

const TRANSLATED_ITEMS = [
  { key: "translated1", statusKey: "translated1Status" },
  { key: "translated2", statusKey: "translated2Status" },
  { key: "translated3", statusKey: "translated3Status" },
  { key: "translated4", statusKey: "translated4Status" },
] as const;

// The "dev board" panel represents a generic, other technical tool
// (Jira/Linear-style) — busy and muted. The "client view" panel represents
// Diaphane itself and gets the same bright "ink" inversion BenefitCard uses
// elsewhere on this page (bg-foreground/text-background): the comparison
// only reads if the client-view panel is visibly the calmer, lighter
// surface. Before the 2026-08-07 dark rebrand this fell out of the app's own
// theme being light by default; on a dark-only app it has to be authored
// explicitly, or both panels render at the same darkness (Impeccable
// critique P0, 2026-08-07) — same reasoning is why this file now uses design
// tokens throughout instead of raw Tailwind neutral-* (critique P1).
const TAG_STYLES: Record<(typeof TICKETS)[number]["tag"], string> = {
  chore: "bg-foreground/10 text-foreground/60",
  bug: "bg-primary/40 text-background",
  feature: "bg-foreground/15 text-foreground/80",
};

export function AiPreview() {
  const t = useTranslations("Landing.features.preview");

  return (
    <div className="flex flex-col gap-8 rounded-3xl border border-dashed border-border bg-card p-6 sm:p-10">
      <div className="flex flex-col items-start gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold tracking-wide text-primary uppercase">
          <Sparkles className="size-3.5" />
          {t("badge")}
        </span>
        <h3 className="text-balance text-2xl font-black sm:text-3xl">{t("heading")}</h3>
        <p className="max-w-xl text-sm text-muted-foreground">{t("subhead")}</p>
      </div>

      <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-2xl bg-muted p-5">
          <div className="mb-4 flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
            <span className="size-2.5 rounded-full bg-muted-foreground/30" />
            <span className="ml-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("devBoardLabel")}
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {TICKETS.map(({ key, tag }) => (
              <li
                key={key}
                className="flex items-center justify-between gap-3 rounded-lg bg-secondary px-3 py-2 text-sm"
              >
                <span className="font-mono text-foreground/80">{t(key)}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold uppercase",
                    TAG_STYLES[tag],
                  )}
                >
                  {tag}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <ArrowRight className="mx-auto size-6 rotate-90 text-primary sm:rotate-0" />

        <div className="rounded-2xl border border-border bg-foreground p-5 text-background">
          <div className="mb-4 text-xs font-semibold tracking-wide text-background/70 uppercase">
            {t("clientViewLabel")}
          </div>
          <ul className="flex flex-col gap-2">
            {TRANSLATED_ITEMS.map(({ key, statusKey }) => (
              <li
                key={key}
                className="flex items-center justify-between gap-3 rounded-lg bg-background/10 px-3 py-2 text-sm"
              >
                <span>{t(key)}</span>
                <span className="shrink-0 text-xs font-semibold text-background">{t(statusKey)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
