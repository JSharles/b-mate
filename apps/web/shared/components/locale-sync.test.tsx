import { render, waitFor } from "@testing-library/react";
import { useLocale } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { getCurrentLocale } from "@/shared/lib/current-locale";
import { LocaleSync } from "./locale-sync";

vi.mock("next-intl", () => ({
  useLocale: vi.fn(),
}));

const mockedUseLocale = vi.mocked(useLocale);

describe("LocaleSync", () => {
  it("syncs the current-locale store to next-intl's resolved locale", async () => {
    mockedUseLocale.mockReturnValue("en");

    render(<LocaleSync />);

    await waitFor(() => expect(getCurrentLocale()).toBe("en"));
  });

  it("renders nothing", () => {
    mockedUseLocale.mockReturnValue("fr");

    const { container } = render(<LocaleSync />);

    expect(container).toBeEmptyDOMElement();
  });
});
