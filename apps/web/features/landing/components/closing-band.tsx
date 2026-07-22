import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function ClosingBand() {
  const t = useTranslations("Landing.closing");

  return (
    <section className="bg-primary px-6 py-20 text-center">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-8">
        <h2 className="text-balance text-3xl leading-tight font-black text-primary-foreground sm:text-4xl">
          {t("title")}
        </h2>
        <Link
          href="/signup"
          className="rounded-full bg-background px-8 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-background/90"
        >
          {t("cta")}
        </Link>
      </div>
    </section>
  );
}
