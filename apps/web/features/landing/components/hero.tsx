import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function Hero() {
  const t = useTranslations("Landing");
  const tHero = useTranslations("Landing.hero");

  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center gap-8 px-6 pt-16 pb-24 text-center sm:pt-24">
      <p className="text-sm font-medium text-muted-foreground">{tHero("eyebrow")}</p>
      <h1 className="text-balance text-4xl leading-[1.05] font-black sm:text-6xl">
        {tHero("titleBefore")}
        <span className="text-primary">{tHero("titleHighlight")}</span>
        {tHero("titleAfter")}
      </h1>
      <p className="max-w-xl text-lg text-balance text-muted-foreground">{tHero("subhead")}</p>
      <Link
        href="/signup"
        className="rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {t("signUp")}
      </Link>
    </section>
  );
}
