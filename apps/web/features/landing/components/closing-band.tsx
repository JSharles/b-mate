import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function ClosingBand() {
  const t = useTranslations("Landing.closing");

  return (
    <section className="bg-landing-rust px-6 py-20 text-center">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-8">
        <h2 className="text-balance text-3xl leading-tight font-black text-landing-ink sm:text-4xl">
          {t("title")}
        </h2>
        <Link
          href="/signup"
          className="rounded-full bg-landing-ink px-8 py-3 text-sm font-semibold text-landing-paper transition-colors hover:bg-landing-ink-soft"
        >
          {t("cta")}
        </Link>
      </div>
    </section>
  );
}
