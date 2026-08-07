import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import SignupPage from "./page";

vi.mock("@/features/auth/components/github-auth-card", () => ({
  GitHubAuthCard: () => <div data-testid="github-auth-card" />,
}));

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

describe("SignupPage", () => {
  it("renders the heading and the GitHub auth card directly, no Developer/Client toggle", async () => {
    const ui = await SignupPage({ params: Promise.resolve({ locale: "fr" }) });
    render(ui);

    expect(screen.getByRole("heading", { name: "title" })).toBeInTheDocument();
    expect(screen.getByTestId("github-auth-card")).toBeInTheDocument();
  });
});
