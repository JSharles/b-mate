import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { NavBar } from "./nav-bar";

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

describe("NavBar", () => {
  it("renders the section anchors and the auth links", () => {
    render(<NavBar />);

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
    expect(screen.getByRole("link", { name: "logIn" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "signUp" })).toHaveAttribute("href", "/signup");
  });
});
