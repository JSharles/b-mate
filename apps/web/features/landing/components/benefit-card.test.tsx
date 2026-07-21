import { render, screen } from "@testing-library/react";
import { ListChecks } from "lucide-react";
import { describe, expect, it } from "vitest";
import { BenefitCard } from "./benefit-card";

describe("BenefitCard", () => {
  it("renders the title and description", () => {
    render(
      <BenefitCard
        icon={ListChecks}
        title="Real progress"
        description="The real version, not a tidied-up summary."
        span={3}
        tone="paper"
      />,
    );

    expect(screen.getByRole("heading", { name: "Real progress" })).toBeInTheDocument();
    expect(screen.getByText("The real version, not a tidied-up summary.")).toBeInTheDocument();
  });

  it("applies a full-width span when span is 6", () => {
    render(
      <BenefitCard
        icon={ListChecks}
        title="Everything in one place"
        description="No more digging around."
        span={6}
        tone="ink"
      />,
    );

    expect(screen.getByRole("heading", { name: "Everything in one place" }).closest("div")).toHaveClass(
      "sm:col-span-6",
    );
  });

  it("renders a badge when provided", () => {
    render(
      <BenefitCard
        icon={ListChecks}
        title="All the technical docs, translated"
        description="Audit reports, quotes, architecture, tech stack."
        span={3}
        tone="ink"
        badge="Coming soon"
      />,
    );

    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });

  it("renders no badge when none is provided", () => {
    render(
      <BenefitCard
        icon={ListChecks}
        title="Multiple projects"
        description="Run several projects at once."
        span={3}
        tone="paper"
      />,
    );

    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
  });
});
