import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

vi.mock("@/features/auth/components/auth-gateway", () => ({
  AuthGateway: () => <div data-testid="auth-gateway" />,
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

describe("LoginPage", () => {
  it("renders the heading and the auth gateway", async () => {
    const ui = await LoginPage({ params: Promise.resolve({ locale: "fr" }) });
    render(ui);

    expect(screen.getByRole("heading", { name: "title" })).toBeInTheDocument();
    expect(screen.getByTestId("auth-gateway")).toBeInTheDocument();
  });
});
