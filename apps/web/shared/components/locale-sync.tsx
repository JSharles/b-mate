"use client";

import { useLocale } from "next-intl";
import { useEffect } from "react";
import { z } from "zod";
import { en, fr } from "zod/locales";
import type { Locale } from "@/i18n/routing";
import { setCurrentLocale } from "@/shared/lib/current-locale";

const zodLocaleMessages = { fr, en };

// Two things that can't be derived from next-intl's own context, kept in
// sync here on locale change:
// - Zod's built-in error messages (invalid email, too short...) are
//   locale-aware via a separate global config, not next-intl.
// - shared/lib/current-locale.ts, for the handful of places (e.g.
//   query-client.ts's global error handler) that run outside a component
//   and can't call useLocale().
// Client-only — form validation runs in the browser, so there's no
// cross-request race like there would be if this mutated global state
// on the server.
export function LocaleSync() {
  const locale = useLocale() as Locale;

  useEffect(() => {
    z.config(zodLocaleMessages[locale]());
    setCurrentLocale(locale);
  }, [locale]);

  return null;
}
