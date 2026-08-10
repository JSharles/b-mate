import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Check,
  FileText,
  ListTree,
  Sparkles,
  Tags,
} from "lucide-react";

const OPERATIONS = [
  { key: "classify", icon: Tags },
  { key: "structure", icon: ListTree },
  { key: "simplify", icon: Sparkles },
] as const;

const CATEGORIES = ["project", "how", "roadmap", "other"] as const;

export function DocumentPreview() {
  const t = useTranslations("Landing.features.documentPreview");

  return (
    <div className="relative mt-6 overflow-hidden rounded-3xl border border-border bg-card p-5 sm:p-8 lg:p-10">
      <div className="pointer-events-none absolute -bottom-32 left-0 size-80 rounded-full bg-glow/10 blur-3xl" />
      <div className="relative">
        <span className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold tracking-[0.16em] text-primary uppercase">
          <FileText className="size-3.5" />
          {t("documentBadge")}
        </span>

        <div className="mt-8 grid items-stretch gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(11rem,0.55fr)_minmax(0,1.2fr)]">
          <div className="rounded-2xl border border-border bg-muted p-5 sm:p-6">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("sourceLabel")}
            </p>
            <div className="mt-5 flex items-start gap-3">
              <FileText className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <h3 className="font-semibold">{t("sourceTitle")}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {t("sourceExcerpt")}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-center gap-2">
            {OPERATIONS.map(({ key, icon: Icon }, index) => (
              <div
                key={key}
                className="grid grid-cols-[auto_1fr] items-start gap-3 rounded-xl px-2 py-2"
              >
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4" strokeWidth={1.75} />
                </div>
                <div>
                  <p className="text-sm font-bold">{t(`${key}Title`)}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {t(`${key}Description`)}
                  </p>
                </div>
                {index < OPERATIONS.length - 1 && (
                  <ArrowRight className="col-start-1 mx-auto size-3 rotate-90 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-5 backdrop-blur sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t("clientLabel")}
              </p>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                {t("reviewStatus")}
              </span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {CATEGORIES.map((category, index) => (
                <span
                  key={category}
                  className={
                    index === 0
                      ? "rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                      : "rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground"
                  }
                >
                  {t(`${category}Category`)}
                </span>
              ))}
            </div>
            <h3 className="mt-6 text-xl font-black">{t("sectionTitle")}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t("sectionText")}
            </p>
            <div className="mt-6 flex gap-3 border-t border-border pt-4">
              <Check className="mt-0.5 size-4 shrink-0 text-success" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                <strong className="text-foreground">{t("controlLabel")}</strong>{" "}
                {t("controlText")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
