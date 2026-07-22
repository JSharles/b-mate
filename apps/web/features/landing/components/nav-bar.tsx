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
    <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
      <Link href="/" className="flex items-center gap-2">
        <Image src="/images/brand-logo.png" alt="" width={32} height={32} priority className="h-8 w-8" />
        <span className="text-lg font-black tracking-tight">b-mate</span>
      </Link>

      <nav className="hidden items-center gap-6 text-xs font-medium text-muted-foreground sm:flex">
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

      <div className="flex items-center gap-4 sm:pl-4 sm:before:mr-4 sm:before:h-4 sm:before:w-px sm:before:bg-border sm:before:content-['']">
        <Link
          href="/login"
          className="hidden text-sm font-semibold text-foreground transition-colors hover:text-foreground/70 sm:inline"
        >
          {t("logIn")}
        </Link>
        <Link
          href="/signup"
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t("signUp")}
        </Link>

        <Sheet>
          <SheetTrigger
            aria-label={t("openMenu")}
            className="rounded-md p-2 text-foreground transition-colors hover:bg-accent sm:hidden"
          >
            <Menu className="size-5" />
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>b-mate</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4 text-sm font-medium text-muted-foreground">
              <SheetClose asChild>
                <a
                  href="#clients"
                  className="rounded-md px-2 py-2 transition-colors hover:bg-accent hover:text-foreground"
                >
                  {t("clients.eyebrow")}
                </a>
              </SheetClose>
              <SheetClose asChild>
                <a
                  href="#developers"
                  className="rounded-md px-2 py-2 transition-colors hover:bg-accent hover:text-foreground"
                >
                  {t("developers.eyebrow")}
                </a>
              </SheetClose>
              <SheetClose asChild>
                <a
                  href="#features"
                  className="rounded-md px-2 py-2 transition-colors hover:bg-accent hover:text-foreground"
                >
                  {t("features.eyebrow")}
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
    </header>
  );
}
