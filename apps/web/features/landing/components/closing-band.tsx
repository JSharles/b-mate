import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function ClosingBand() {
  const t = useTranslations("Landing.closing");

  return (
    <section className="bg-primary px-6 py-20 text-center">
      <div className="mx-auto flex max-w-2xl flex-col items-center">
        <p className="mb-4 text-xs font-semibold tracking-[0.18em] text-primary-foreground/70 uppercase">
          {t("eyebrow")}
        </p>
        <h2 className="text-balance text-3xl leading-tight font-black text-primary-foreground sm:text-4xl">
          {t("title")}
        </h2>
        <p className="mt-5 max-w-xl leading-relaxed text-primary-foreground/70">
          {t("subhead")}
        </p>
        <Link
          href="/signup"
          className="mt-8 rounded-full bg-background px-8 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-background/90 focus-visible:ring-3 focus-visible:ring-background/40 focus-visible:outline-none"
        >
          {t("cta")}
        </Link>
      </div>
    </section>
  );
}
