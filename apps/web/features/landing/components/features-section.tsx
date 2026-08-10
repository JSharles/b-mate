import { useTranslations } from "next-intl";
import { Eye, FileCheck2, GitBranch } from "lucide-react";
import { AiPreview } from "./ai-preview";
import { DocumentPreview } from "./document-preview";

const CARDS = [
  { icon: GitBranch, key: "source" },
  { icon: FileCheck2, key: "control" },
  { icon: Eye, key: "access" },
] as const;

export function FeaturesSection() {
  const t = useTranslations("Landing.features");

  return (
    <section
      id="product"
      className="mx-auto flex max-w-5xl scroll-mt-24 flex-col px-6 py-16 sm:py-24"
    >
      <div className="mb-10 max-w-2xl">
        <p className="text-sm font-semibold tracking-[0.18em] text-primary uppercase">
          {t("eyebrow")}
        </p>
        <h2 className="mt-4 text-balance text-3xl font-black tracking-[-0.025em] sm:text-5xl">
          {t("title")}
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          {t("subhead")}
        </p>
      </div>
      <AiPreview />
      <DocumentPreview />
      <div className="mt-6 grid divide-y divide-border border-y border-border lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        {CARDS.map(({ icon: Icon, key }) => (
          <div
            key={key}
            className="flex gap-4 py-6 lg:px-6 lg:first:pl-0 lg:last:pr-0"
          >
            <Icon
              className="mt-0.5 size-5 shrink-0 text-primary"
              strokeWidth={1.75}
            />
            <div>
              <h3 className="font-bold">{t(`${key}Title`)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {t(`${key}Description`)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
