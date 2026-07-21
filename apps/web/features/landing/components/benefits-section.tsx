import { useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";
import { ListChecks, Lightbulb, LayoutGrid, MessageSquareOff, Wrench, Repeat2 } from "lucide-react";
import { BenefitCard } from "./benefit-card";

interface Track {
  namespace: "clients" | "developers";
  icons: readonly LucideIcon[];
  spans: readonly (3 | 6)[];
  tones: readonly ("paper" | "ink")[];
}

const TRACKS: readonly Track[] = [
  {
    namespace: "clients",
    icons: [ListChecks, Lightbulb, LayoutGrid],
    spans: [3, 3, 6],
    tones: ["paper", "ink", "paper"],
  },
  {
    namespace: "developers",
    icons: [MessageSquareOff, Wrench, Repeat2],
    spans: [6, 3, 3],
    tones: ["ink", "paper", "ink"],
  },
];

function BenefitTrack({ namespace, icons, spans, tones }: Track) {
  const t = useTranslations(`Landing.${namespace}`);

  return (
    <div id={namespace} className="flex flex-col gap-6 scroll-mt-24">
      <h2 className="text-sm font-semibold tracking-[0.2em] text-landing-rust uppercase">
        {t("eyebrow")}
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        {icons.map((Icon, index) => (
          <BenefitCard
            key={index}
            icon={Icon}
            title={t(`card${index + 1}Title` as "card1Title")}
            description={t(`card${index + 1}Description` as "card1Description")}
            span={spans[index]}
            tone={tones[index]}
          />
        ))}
      </div>
    </div>
  );
}

export function BenefitsSection() {
  return (
    <section className="mx-auto flex max-w-5xl flex-col gap-16 px-6 py-20">
      {TRACKS.map((track) => (
        <BenefitTrack key={track.namespace} {...track} />
      ))}
    </section>
  );
}
