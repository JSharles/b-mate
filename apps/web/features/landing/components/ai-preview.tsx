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

const TAG_STYLES: Record<(typeof TICKETS)[number]["tag"], string> = {
  chore: "bg-landing-paper/10 text-landing-paper/60",
  bug: "bg-landing-rust/20 text-landing-rust",
  feature: "bg-landing-paper/15 text-landing-paper/80",
};

export function AiPreview() {
  const t = useTranslations("Landing.features.preview");

  return (
    <div className="flex flex-col gap-8 rounded-3xl border border-landing-ink-line bg-landing-ink-soft p-6 sm:p-10">
      <div className="flex flex-col items-start gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-landing-rust/15 px-3 py-1 text-xs font-semibold tracking-wide text-landing-rust uppercase">
          <Sparkles className="size-3.5" />
          {t("badge")}
        </span>
        <h3 className="text-balance text-2xl font-black sm:text-3xl">{t("heading")}</h3>
        <p className="max-w-xl text-sm text-landing-paper/70">{t("subhead")}</p>
      </div>

      <div className="grid grid-cols-1 items-center gap-6 sm:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-2xl bg-landing-ink p-5">
          <div className="mb-4 flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-landing-paper/20" />
            <span className="size-2.5 rounded-full bg-landing-paper/20" />
            <span className="size-2.5 rounded-full bg-landing-paper/20" />
            <span className="ml-2 text-xs font-semibold tracking-wide text-landing-paper/50 uppercase">
              {t("devBoardLabel")}
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {TICKETS.map(({ key, tag }) => (
              <li
                key={key}
                className="flex items-center justify-between gap-3 rounded-lg bg-landing-ink-soft px-3 py-2 text-sm"
              >
                <span className="font-mono text-landing-paper/80">{t(key)}</span>
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

        <ArrowRight className="mx-auto size-6 rotate-90 text-landing-rust sm:rotate-0" />

        <div className="rounded-2xl bg-landing-paper p-5 text-landing-ink">
          <div className="mb-4 text-xs font-semibold tracking-wide text-landing-ink/50 uppercase">
            {t("clientViewLabel")}
          </div>
          <ul className="flex flex-col gap-2">
            {TRANSLATED_ITEMS.map(({ key, statusKey }) => (
              <li
                key={key}
                className="flex items-center justify-between gap-3 rounded-lg bg-landing-paper-dim px-3 py-2 text-sm"
              >
                <span>{t(key)}</span>
                <span className="shrink-0 text-xs font-medium text-landing-rust">{t(statusKey)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
