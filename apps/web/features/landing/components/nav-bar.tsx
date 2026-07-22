import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";

export function NavBar() {
  const t = useTranslations("Landing");

  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <div className="flex items-center gap-2">
        <Image src="/images/brand-logo.png" alt="" width={32} height={32} priority className="h-8 w-8" />
        <span className="text-lg font-black tracking-tight">b-mate</span>
      </div>

      <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground sm:flex">
        <a href="#clients" className="transition-colors hover:text-foreground">
          {t("clients.eyebrow")}
        </a>
        <a href="#developers" className="transition-colors hover:text-foreground">
          {t("developers.eyebrow")}
        </a>
        <a href="#features" className="transition-colors hover:text-foreground">
          {t("features.eyebrow")}
        </a>
        <a href="#faq" className="transition-colors hover:text-foreground">
          {t("faq.navLabel")}
        </a>
      </nav>

      <div className="flex items-center gap-4">
        <Link
          href="/login"
          className="text-sm font-semibold text-foreground transition-colors hover:text-foreground/70"
        >
          {t("logIn")}
        </Link>
        <Link
          href="/signup"
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t("signUp")}
        </Link>
      </div>
    </header>
  );
}
