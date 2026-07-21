import { useTranslations } from "next-intl";
import { ClipboardList, Mail, Eye, FolderKanban } from "lucide-react";
import { BenefitCard } from "./benefit-card";

const ICONS = [ClipboardList, Mail, Eye, FolderKanban] as const;
const TONES = ["paper", "ink", "ink", "paper"] as const;

export function FeaturesSection() {
  const t = useTranslations("Landing.features");

  return (
    <section id="features" className="mx-auto flex max-w-5xl scroll-mt-24 flex-col gap-6 px-6 py-20">
      <h2 className="text-sm font-semibold tracking-[0.2em] text-landing-rust uppercase">
        {t("eyebrow")}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        {ICONS.map((Icon, index) => (
          <BenefitCard
            key={index}
            icon={Icon}
            title={t(`card${index + 1}Title` as "card1Title")}
            description={t(`card${index + 1}Description` as "card1Description")}
            span={3}
            tone={TONES[index]}
          />
        ))}
      </div>
    </section>
  );
}
