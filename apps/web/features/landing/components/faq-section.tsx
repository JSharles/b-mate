import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

const QUESTION_KEYS = ["q1", "q2", "q3", "q4", "q5"] as const;

export function FaqSection() {
  const t = useTranslations("Landing.faq");

  return (
    <section id="faq" className="mx-auto flex max-w-3xl scroll-mt-24 flex-col gap-6 px-6 py-20">
      <h2 className="text-sm font-semibold tracking-[0.2em] text-primary uppercase">
        {t("eyebrow")}
      </h2>
      <div className="flex flex-col divide-y divide-border">
        {QUESTION_KEYS.map((questionKey, index) => {
          const answerKey = `a${index + 1}` as "a1";

          return (
            <details key={questionKey} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold marker:content-none">
                {t(questionKey)}
                <ChevronDown className="size-5 shrink-0 text-primary transition-transform group-open:rotate-180" />
              </summary>
              <p className="pt-3 text-sm leading-relaxed text-muted-foreground">{t(answerKey)}</p>
            </details>
          );
        })}
      </div>
    </section>
  );
}
