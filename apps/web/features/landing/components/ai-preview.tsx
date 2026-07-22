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

// The "dev board" panel intentionally stays dark — it's illustrating a
// generic, other technical tool (Jira/Linear-style), contrasted against the
// "client view" panel which uses the app's own light tokens, since that one
// represents b-mate itself. This is a deliberate visual metaphor within the
// marketing copy, not the app's own theme (see FR-002 — no dark app theme).
const TAG_STYLES: Record<(typeof TICKETS)[number]["tag"], string> = {
  chore: "bg-neutral-100/10 text-neutral-100/60",
  bug: "bg-primary/20 text-primary",
  feature: "bg-neutral-100/15 text-neutral-100/80",
};

export function AiPreview() {
  const t = useTranslations("Landing.features.preview");

  return (
    <div className="flex flex-col gap-8 rounded-3xl border border-border bg-card p-6 sm:p-10">
      <div className="flex flex-col items-start gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold tracking-wide text-primary uppercase">
          <Sparkles className="size-3.5" />
          {t("badge")}
        </span>
        <h3 className="text-balance text-2xl font-black sm:text-3xl">{t("heading")}</h3>
        <p className="max-w-xl text-sm text-muted-foreground">{t("subhead")}</p>
      </div>

      <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-2xl bg-neutral-900 p-5">
          <div className="mb-4 flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-neutral-100/20" />
            <span className="size-2.5 rounded-full bg-neutral-100/20" />
            <span className="size-2.5 rounded-full bg-neutral-100/20" />
            <span className="ml-2 text-xs font-semibold tracking-wide text-neutral-100/50 uppercase">
              {t("devBoardLabel")}
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {TICKETS.map(({ key, tag }) => (
              <li
                key={key}
                className="flex items-center justify-between gap-3 rounded-lg bg-neutral-800 px-3 py-2 text-sm"
              >
                <span className="font-mono text-neutral-100/80">{t(key)}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
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

        <div className="rounded-2xl border border-border bg-background p-5 text-foreground">
          <div className="mb-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("clientViewLabel")}
          </div>
          <ul className="flex flex-col gap-2">
            {TRANSLATED_ITEMS.map(({ key, statusKey }) => (
              <li
                key={key}
                className="flex items-center justify-between gap-3 rounded-lg bg-card px-3 py-2 text-sm"
              >
                <span>{t(key)}</span>
                <span className="shrink-0 text-xs font-medium text-primary">{t(statusKey)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
