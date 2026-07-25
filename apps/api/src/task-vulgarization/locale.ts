// The app's currently supported UI locales (apps/web/i18n/routing.ts) —
// vulgarization only ever targets this fixed, small set (spec.md FR-006).
export const SUPPORTED_LOCALES = ['en', 'fr'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

// Matches apps/web/i18n/routing.ts's defaultLocale (research.md Decision 5).
export const DEFAULT_LOCALE: Locale = 'fr';

export function parseLocale(value: unknown): Locale {
  return typeof value === 'string' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
    ? (value as Locale)
    : DEFAULT_LOCALE;
}
