import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fr", "en"],
  defaultLocale: "fr",
  // Explicit prefix on every locale (including the default) rather than
  // "as-needed" — keeps hreflang/canonical URLs unambiguous for SEO: every
  // page has exactly one clean URL per locale, no bare "/" competing with "/fr".
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
