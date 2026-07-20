import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { vi } from "vitest";

// jsdom doesn't implement matchMedia — needed by shadcn's use-mobile hook
// (used internally by the Sidebar component).
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// Global next-intl mock: translations resolve to their raw key rather than
// real copy. Keeps component tests decoupled from actual wording (a
// translation edit shouldn't break assertions) — tests assert against keys,
// e.g. getByLabelText("email"). Override useLocale/useTranslations per-test
// with vi.mocked(...) when a test needs specific behavior.
vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  return {
    ...actual,
    useTranslations: () => (key: string) => key,
    useLocale: () => "fr",
    NextIntlClientProvider: ({ children }: { children: ReactNode }) => children,
  };
});

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  setRequestLocale: () => {},
}));
