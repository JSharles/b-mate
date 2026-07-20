import type { Locale } from "@/i18n/routing";

// Read/write outside of React — for the few places (e.g. query-client.ts's
// global error handler) that run in a plain callback, not a component, and
// so can't call useLocale(). Kept in sync by LocaleSync.
let current: Locale = "fr";

export function setCurrentLocale(locale: Locale) {
  current = locale;
}

export function getCurrentLocale(): Locale {
  return current;
}
