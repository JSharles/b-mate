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

// jsdom doesn't implement these — needed by Radix's Select (first used by
// ProjectPreferences) to open/scroll its popover without throwing.
if (typeof Element !== "undefined") {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}

// jsdom doesn't implement IntersectionObserver — needed by embla-carousel
// (first used by CurrentTaskCard's multi-task carousel) to track which
// slides are in view.
if (typeof window !== "undefined" && !window.IntersectionObserver) {
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin: string = "";
    readonly thresholds: ReadonlyArray<number> = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  window.IntersectionObserver = MockIntersectionObserver;
}

// jsdom doesn't implement ResizeObserver either — embla-carousel also uses
// it to recompute slide sizes on container resize.
if (typeof window !== "undefined" && !window.ResizeObserver) {
  class MockResizeObserver implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = MockResizeObserver;
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
