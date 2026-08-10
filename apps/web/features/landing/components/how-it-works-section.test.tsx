import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HowItWorksSection } from "./how-it-works-section";

describe("HowItWorksSection", () => {
  it("renders the three setup steps in order", () => {
    render(<HowItWorksSection />);

    expect(
      screen.getByRole("heading", { level: 2, name: "title" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("stepLabel")).toHaveLength(3);
    expect(screen.getByText("connectTitle")).toBeInTheDocument();
    expect(screen.getByText("contextTitle")).toBeInTheDocument();
    expect(screen.getByText("inviteTitle")).toBeInTheDocument();
  });
});
