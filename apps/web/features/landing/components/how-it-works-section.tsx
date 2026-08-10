import { useTranslations } from "next-intl";
import { Cable, Send, WandSparkles } from "lucide-react";

const STEPS = [
  { key: "connect", icon: Cable },
  { key: "context", icon: WandSparkles },
  { key: "invite", icon: Send },
] as const;

export function HowItWorksSection() {
  const t = useTranslations("Landing.howItWorks");

  return (
    <section
      id="how-it-works"
      className="mx-auto max-w-5xl scroll-mt-24 px-6 py-16 sm:py-24"
    >
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div>
          <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
            {t("eyebrow")}
          </p>
          <h2 className="mt-4 text-balance text-3xl font-black tracking-[-0.025em] sm:text-5xl">
            {t("title")}
          </h2>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-muted-foreground">
            {t("subhead")}
          </p>
        </div>

        <ol className="border-y border-border">
          {STEPS.map(({ key, icon: Icon }, index) => (
            <li
              key={key}
              className="grid grid-cols-[auto_1fr] gap-5 border-b border-border py-7 last:border-b-0"
            >
              <div className="flex size-11 items-center justify-center rounded-lg bg-card text-primary">
                <Icon className="size-5" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                  {t("stepLabel", { number: index + 1 })}
                </p>
                <h3 className="mt-2 text-xl font-bold">{t(`${key}Title`)}</h3>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                  {t(`${key}Description`)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
