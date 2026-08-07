import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AuthGateway } from "./auth-gateway";

vi.mock("./github-auth-card", () => ({
  GitHubAuthCard: () => <div data-testid="github-auth-card" />,
}));

vi.mock("./login-form", () => ({
  LoginForm: () => <div data-testid="login-form" />,
}));

describe("AuthGateway", () => {
  it("presents both choices unselected, with neither panel interactive, until one is picked", () => {
    render(<AuthGateway />);

    expect(screen.getByRole("button", { name: "developer" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "client" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByTestId("developer-panel")).toHaveAttribute("inert");
    expect(screen.getByTestId("client-panel")).toHaveAttribute("inert");
  });

  it("reveals the developer (GitHub) panel and marks it interactive when chosen", async () => {
    const user = userEvent.setup();
    render(<AuthGateway />);

    await user.click(screen.getByRole("button", { name: "developer" }));

    expect(screen.getByRole("button", { name: "developer" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("developer-panel")).not.toHaveAttribute("inert");
    expect(screen.getByTestId("client-panel")).toHaveAttribute("inert");
  });

  it("reveals the client (login form) panel and marks it interactive when chosen", async () => {
    const user = userEvent.setup();
    render(<AuthGateway />);

    await user.click(screen.getByRole("button", { name: "client" }));

    expect(screen.getByRole("button", { name: "client" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("client-panel")).not.toHaveAttribute("inert");
    expect(screen.getByTestId("developer-panel")).toHaveAttribute("inert");
  });

  it("switches cleanly between panels without leaving the previous one interactive", async () => {
    const user = userEvent.setup();
    render(<AuthGateway />);

    await user.click(screen.getByRole("button", { name: "developer" }));
    await user.click(screen.getByRole("button", { name: "client" }));

    expect(screen.getByTestId("client-panel")).not.toHaveAttribute("inert");
    expect(screen.getByTestId("developer-panel")).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "developer" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
