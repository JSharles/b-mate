import { useTranslations } from "next-intl";
import { ArrowRight, CircleDot, Sparkles } from "lucide-react";

export function AiPreview() {
  const t = useTranslations("Landing.features.preview");

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 sm:p-8 lg:p-10">
      <div className="pointer-events-none absolute -top-32 right-0 size-80 rounded-full bg-glow/15 blur-3xl" />
      <div className="relative flex flex-col gap-8">
        <span className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold tracking-[0.16em] text-primary uppercase">
          <Sparkles className="size-3.5" />
          {t("badge")}
        </span>

        <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,0.8fr)_auto_minmax(0,1.2fr)]">
          <div className="rounded-2xl border border-border bg-muted p-5 sm:p-6">
            <div className="mb-6 flex items-center justify-between gap-4">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t("sourceLabel")}
              </span>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground/70">
                {t("sourceStatus")}
              </span>
            </div>
            <p className="font-mono text-sm leading-relaxed text-foreground">
              {t("sourceTitle")}
            </p>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {t("sourceDescription")}
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full bg-secondary px-2.5 py-1">
                auth
              </span>
              <span className="rounded-full bg-secondary px-2.5 py-1">
                security
              </span>
            </div>
          </div>

          <ArrowRight className="mx-auto size-6 rotate-90 text-primary lg:rotate-0" />

          <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-5 backdrop-blur sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t("clientLabel")}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <CircleDot
                  className="size-3.5 text-success"
                  aria-hidden="true"
                />
                {t("clientStatus")}
              </span>
            </div>
            <h3 className="text-balance text-2xl font-black sm:text-3xl">
              {t("clientTitle")}
            </h3>
            <dl className="mt-6 grid gap-5 sm:grid-cols-2">
              {(["why", "impact", "state"] as const).map((key) => (
                <div
                  key={key}
                  className={key === "state" ? "sm:col-span-2" : undefined}
                >
                  <dt className="text-xs font-semibold tracking-wide text-primary uppercase">
                    {t(`${key}Label`)}
                  </dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {t(key)}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
              {t("clientNote")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
