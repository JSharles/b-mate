import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import SignupPage from "./page";

vi.mock("@/features/auth/components/signup-form", () => ({
  SignupForm: () => <div data-testid="signup-form" />,
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
  it("renders the heading and the signup form", async () => {
    const ui = await SignupPage({ params: Promise.resolve({ locale: "fr" }) });
    render(ui);

    expect(screen.getByRole("heading", { name: "title" })).toBeInTheDocument();
    expect(screen.getByTestId("signup-form")).toBeInTheDocument();
  });
});
