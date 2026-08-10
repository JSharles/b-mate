import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Link } from "@/i18n/navigation";

export function Hero() {
  const tHero = useTranslations("Landing.hero");

  return (
    <section className="mx-auto flex max-w-5xl flex-col items-center px-6 pt-16 pb-16 text-center sm:pt-24 sm:pb-24">
      <p className="mb-6 text-sm font-medium text-muted-foreground">
        {tHero("eyebrow")}
      </p>
      <h1 className="max-w-4xl text-balance text-4xl leading-[1.02] font-black tracking-[-0.035em] sm:text-6xl lg:text-7xl">
        {tHero("titleBefore")}
        <span className="text-primary">{tHero("titleHighlight")}</span>
        {tHero("titleAfter")}
      </h1>
      <p className="mt-7 max-w-2xl text-lg leading-relaxed text-balance text-muted-foreground sm:text-xl">
        {tHero("subhead")}
      </p>

      <Link
        href="/signup"
        className="mt-9 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {tHero("primaryCta")}
      </Link>

      <ul className="mt-10 flex max-w-3xl flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
        {(["trustSources", "trustReadOnly", "trustPublishing"] as const).map(
          (key) => (
            <li key={key} className="flex items-center gap-2">
              <Check className="size-4 text-primary" aria-hidden="true" />
              {tHero(key)}
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
