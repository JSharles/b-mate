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
  it("renders the hero, benefits and closing sections", async () => {
    const ui = await LandingPage({ params: Promise.resolve({ locale: "fr" }) });
    render(ui);

    expect(screen.getAllByRole("link", { name: "signUp" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "logIn" })).toHaveAttribute("href", "/login");
    expect(screen.getAllByText("eyebrow")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "clients.eyebrow" })).toHaveAttribute("href", "#clients");
    expect(screen.getByRole("link", { name: "developers.eyebrow" })).toHaveAttribute(
      "href",
      "#developers",
    );
    expect(screen.getByRole("link", { name: "features.eyebrow" })).toHaveAttribute(
      "href",
      "#features",
    );
    expect(screen.getByRole("link", { name: "faq.navLabel" })).toHaveAttribute("href", "#faq");
    expect(screen.getByText("q1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "cta" })).toHaveAttribute("href", "/signup");
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
