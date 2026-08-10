import { useTranslations } from "next-intl";
import type { LucideIcon } from "lucide-react";
import {
  BookOpenText,
  Eye,
  FileCheck2,
  PanelsTopLeft,
  MessageSquareText,
  Users,
} from "lucide-react";

interface Track {
  namespace: "clients" | "developers";
  icons: readonly LucideIcon[];
}

const TRACKS: readonly Track[] = [
  {
    namespace: "developers",
    icons: [MessageSquareText, PanelsTopLeft, FileCheck2],
  },
  {
    namespace: "clients",
    icons: [Eye, BookOpenText, Users],
  },
];

function BenefitTrack({ namespace, icons }: Track) {
  const t = useTranslations(`Landing.${namespace}`);

  return (
    <div
      id={namespace}
      className="grid scroll-mt-24 gap-10 border-t border-border py-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:py-20"
    >
      <div>
        <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
          {t("eyebrow")}
        </p>
        <h2 className="mt-4 max-w-md text-balance text-3xl font-black tracking-[-0.025em] sm:text-4xl">
          {t("title")}
        </h2>
        <p className="mt-5 max-w-md leading-relaxed text-muted-foreground">
          {t("subhead")}
        </p>
      </div>
      <div className="divide-y divide-border">
        {icons.map((Icon, index) => (
          <div
            key={index}
            className="grid gap-3 py-6 first:pt-0 sm:grid-cols-[auto_1fr] sm:gap-5"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-5" strokeWidth={1.75} />
            </div>
            <div>
              <h3 className="text-lg font-bold">
                {t(`card${index + 1}Title` as "card1Title")}
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
                {t(`card${index + 1}Description` as "card1Description")}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BenefitsSection() {
  return (
    <section
      id="benefits"
      className="mx-auto flex max-w-5xl scroll-mt-24 flex-col px-6 py-8 sm:py-12"
    >
      {TRACKS.map((track) => (
        <BenefitTrack key={track.namespace} {...track} />
      ))}
    </section>
  );
}
