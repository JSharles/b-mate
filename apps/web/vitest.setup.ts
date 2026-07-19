import "@testing-library/jest-dom/vitest";

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
