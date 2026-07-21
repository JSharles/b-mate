import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { Hero } from "./hero";

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

describe("Hero", () => {
  it("renders the headline and a sign up call to action", () => {
    render(<Hero />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("titleBeforetitleHighlighttitleAfter");
    expect(screen.getByText("titleHighlight")).toBeInTheDocument();
    expect(screen.getByText("eyebrow")).toBeInTheDocument();
    expect(screen.getByText("subhead")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "signUp" })).toHaveAttribute("href", "/signup");
  });
});
