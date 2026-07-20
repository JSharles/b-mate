import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import LandingPage, { generateMetadata } from "./page";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("LandingPage", () => {
  it("renders sign up and log in links", async () => {
    const ui = await LandingPage({ params: Promise.resolve({ locale: "fr" }) });
    render(ui);

    expect(screen.getByRole("link", { name: "signUp" })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: "logIn" })).toHaveAttribute("href", "/login");
  });

  it("sets hreflang alternates and a canonical URL for the current locale", async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });

    expect(metadata.title).toBe("title");
    expect(metadata.description).toBe("description");
    expect(metadata.alternates?.canonical).toBe("/en");
    expect(metadata.alternates?.languages).toEqual({
      fr: "/fr",
      en: "/en",
      "x-default": "/fr",
    });
  });
});
