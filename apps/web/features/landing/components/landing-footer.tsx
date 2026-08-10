import Image from "next/image";
import { useTranslations } from "next-intl";

export function LandingFooter() {
  const t = useTranslations("Landing.footer");

  return (
    <footer className="border-t border-border px-6 py-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
        <div className="flex items-center gap-3">
          <Image
            src="/images/logo-square.png"
            alt=""
            width={332}
            height={332}
            className="size-8"
          />
          <span className="font-black tracking-tight text-primary">
            Diaphane
          </span>
        </div>
        <p className="max-w-lg text-sm text-muted-foreground">
          {t("statement")}
        </p>
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t("status")}
        </p>
      </div>
    </footer>
  );
}
