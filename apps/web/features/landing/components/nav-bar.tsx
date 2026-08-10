import { useTranslations } from "next-intl";
import { Menu } from "lucide-react";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/components/ui/sheet";

export function NavBar() {
  const t = useTranslations("Landing");

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/images/logo-square.png"
            alt=""
            width={332}
            height={332}
            priority
            className="size-10"
          />
          <span className="text-xl font-black tracking-tight text-primary">
            Diaphane
          </span>
        </Link>

        <nav className="hidden items-center gap-6 text-xs font-medium text-muted-foreground md:flex">
          <a
            href="#product"
            className="transition-colors hover:text-foreground"
          >
            {t("nav.product")}
          </a>
          <a
            href="#how-it-works"
            className="transition-colors hover:text-foreground"
          >
            {t("nav.howItWorks")}
          </a>
          <a
            href="#benefits"
            className="transition-colors hover:text-foreground"
          >
            {t("nav.benefits")}
          </a>
          <a href="#faq" className="transition-colors hover:text-foreground">
            {t("faq.navLabel")}
          </a>
        </nav>

        <div className="flex items-center gap-4 md:pl-4 md:before:mr-4 md:before:h-4 md:before:w-px md:before:bg-border md:before:content-['']">
          <Link
            href="/login"
            className="hidden text-sm font-semibold text-foreground transition-colors hover:text-foreground/70 md:inline"
          >
            {t("logIn")}
          </Link>
          <Link
            href="/signup"
            className="hidden rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 md:inline-flex"
          >
            {t("signUp")}
          </Link>

          <Sheet>
            <SheetTrigger
              aria-label={t("openMenu")}
              className="rounded-md p-3 text-foreground transition-colors hover:bg-accent md:hidden"
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Diaphane</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4 text-sm font-medium text-muted-foreground">
                <SheetClose asChild>
                  <a
                    href="#product"
                    className="rounded-md px-2 py-2 transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {t("nav.product")}
                  </a>
                </SheetClose>
                <SheetClose asChild>
                  <a
                    href="#how-it-works"
                    className="rounded-md px-2 py-2 transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {t("nav.howItWorks")}
                  </a>
                </SheetClose>
                <SheetClose asChild>
                  <a
                    href="#benefits"
                    className="rounded-md px-2 py-2 transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {t("nav.benefits")}
                  </a>
                </SheetClose>
                <SheetClose asChild>
                  <a
                    href="#faq"
                    className="rounded-md px-2 py-2 transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {t("faq.navLabel")}
                  </a>
                </SheetClose>
              </nav>
              <SheetFooter>
                <SheetClose asChild>
                  <Link
                    href="/login"
                    className="text-center text-sm font-semibold text-foreground transition-colors hover:text-foreground/70"
                  >
                    {t("logIn")}
                  </Link>
                </SheetClose>
                <SheetClose asChild>
                  <Link
                    href="/signup"
                    className="rounded-full bg-primary px-5 py-2.5 text-center text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    {t("signUp")}
                  </Link>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
