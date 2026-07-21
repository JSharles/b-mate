import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";

export function NavBar() {
  const t = useTranslations("Landing");

  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <div className="flex items-center gap-2">
        <Image
          src="/images/brand-logo.png"
          alt=""
          width={32}
          height={32}
          priority
          className="h-8 w-8 invert"
        />
        <span className="text-lg font-black tracking-tight">b-mate</span>
      </div>

      <nav className="hidden items-center gap-8 text-sm font-medium text-landing-paper/80 sm:flex">
        <a href="#clients" className="transition-colors hover:text-landing-paper">
          {t("clients.eyebrow")}
        </a>
        <a href="#developers" className="transition-colors hover:text-landing-paper">
          {t("developers.eyebrow")}
        </a>
        <a href="#features" className="transition-colors hover:text-landing-paper">
          {t("features.eyebrow")}
        </a>
        <a href="#faq" className="transition-colors hover:text-landing-paper">
          {t("faq.navLabel")}
        </a>
      </nav>

      <div className="flex items-center gap-4">
        <Link
          href="/login"
          className="text-sm font-semibold text-landing-paper transition-colors hover:text-landing-paper/70"
        >
          {t("logIn")}
        </Link>
        <Link
          href="/signup"
          className="rounded-full bg-landing-rust px-5 py-2.5 text-sm font-semibold text-landing-ink transition-colors hover:bg-landing-rust-hover"
        >
          {t("signUp")}
        </Link>
      </div>
    </header>
  );
}
