import { useTranslations } from "next-intl";
import { Eye, FileText, ArrowLeftRight } from "lucide-react";
import { BenefitCard } from "./benefit-card";
import { AiPreview } from "./ai-preview";

const CARDS = [
  { icon: Eye, span: 3, tone: "paper", comingSoon: false },
  { icon: FileText, span: 3, tone: "ink", comingSoon: true },
  { icon: ArrowLeftRight, span: 6, tone: "paper", comingSoon: true },
] as const;

export function FeaturesSection() {
  const t = useTranslations("Landing.features");

  return (
    <section id="features" className="mx-auto flex max-w-5xl scroll-mt-24 flex-col gap-10 px-6 py-20">
      <h2 className="text-sm font-semibold tracking-[0.2em] text-primary uppercase">
        {t("eyebrow")}
      </h2>
      <AiPreview />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        {CARDS.map(({ icon, span, tone, comingSoon }, index) => (
          <BenefitCard
            key={index}
            icon={icon}
            title={t(`card${index + 1}Title` as "card1Title")}
            description={t(`card${index + 1}Description` as "card1Description")}
            span={span}
            tone={tone}
            badge={comingSoon ? t("comingSoonBadge") : undefined}
          />
        ))}
      </div>
    </section>
  );
}
