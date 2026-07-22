import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { NavBar } from "@/features/landing/components/nav-bar";
import { Hero } from "@/features/landing/components/hero";
import { BenefitsSection } from "@/features/landing/components/benefits-section";
import { FeaturesSection } from "@/features/landing/components/features-section";
import { FaqSection } from "@/features/landing/components/faq-section";
import { ClosingBand } from "@/features/landing/components/closing-band";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: `/${locale}`,
      languages: {
        ...Object.fromEntries(routing.locales.map((l) => [l, `/${l}`])),
        "x-default": `/${routing.defaultLocale}`,
      },
    },
  };
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="text-foreground">
      <NavBar />
      <Hero />
      <BenefitsSection />
      <FeaturesSection />
      <FaqSection />
      <ClosingBand />
    </main>
  );
}
