import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SignupPage from "./page";

vi.mock("@/features/auth/components/signup-form", () => ({
  SignupForm: () => <div data-testid="signup-form" />,
}));

describe("SignupPage", () => {
  it("renders the heading and the signup form", async () => {
    const ui = await SignupPage({ params: Promise.resolve({ locale: "fr" }) });
    render(ui);

    expect(screen.getByRole("heading", { name: "title" })).toBeInTheDocument();
    expect(screen.getByTestId("signup-form")).toBeInTheDocument();
  });
});
