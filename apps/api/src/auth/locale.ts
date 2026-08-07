export const SUPPORTED_LOCALES = ['fr', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'fr';

// Shared by auth.controller.ts (login flow) and
// board-connections.controller.ts (board-connection flow,
// specs/010-github-oauth-board-connection) — both redirect the browser
// back to a locale-prefixed web route after a GitHub round-trip.
export function resolveLocale(raw: string | undefined): SupportedLocale {
  return SUPPORTED_LOCALES.includes(raw as SupportedLocale)
    ? (raw as SupportedLocale)
    : DEFAULT_LOCALE;
}
