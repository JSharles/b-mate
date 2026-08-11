import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StepHeading } from "./step-heading";

describe("StepHeading", () => {
  // The four sections are a sequence and nothing said so — they rendered as
  // interchangeable blocks named after objects rather than after steps, so a
  // contributor could not tell that one feeds the next.
  it("names the step and what it is for", () => {
    render(
      <StepHeading
        step={2}
        namespace="Projects.Documentation.Steps"
        titleKey="title2"
        purposeKey="purpose2"
      />,
    );

    expect(screen.getByRole("heading", { name: /title2/ })).toBeVisible();
    expect(screen.getByText("purpose2")).toBeVisible();
  });

  // The number is decoration to a screen reader unless the position is spoken,
  // and the position is the whole point.
  it("gives a screen reader the position, not a bare numeral", () => {
    render(
      <StepHeading
        step={3}
        namespace="Projects.Documentation.Steps"
        titleKey="title3"
        purposeKey="purpose3"
      />,
    );

    expect(screen.getByRole("heading")).toHaveTextContent("stepLabel");
    expect(screen.getByText("3")).toHaveAttribute("aria-hidden", "true");
  });
});
