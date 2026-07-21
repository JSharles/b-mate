import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function Hero() {
  const t = useTranslations("Landing");
  const tHero = useTranslations("Landing.hero");

  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center gap-8 px-6 pt-16 pb-24 text-center sm:pt-24">
      <p className="text-sm font-semibold tracking-[0.2em] text-landing-rust uppercase">
        {tHero("eyebrow")}
      </p>
      <h1 className="text-balance text-4xl leading-[1.05] font-black sm:text-6xl">
        {tHero("titleBefore")}
        <span className="text-landing-rust">{tHero("titleHighlight")}</span>
        {tHero("titleAfter")}
      </h1>
      <p className="max-w-xl text-lg text-balance text-landing-paper/75">{tHero("subhead")}</p>
      <Link
        href="/signup"
        className="rounded-full bg-landing-rust px-7 py-3 text-sm font-semibold text-landing-ink transition-colors hover:bg-landing-rust-hover"
      >
        {t("signUp")}
      </Link>
    </section>
  );
}
