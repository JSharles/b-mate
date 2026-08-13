import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { ClientTimeline } from "./client-timeline";

const milestones = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    when: "Q2 2026",
    title: "Cadrage",
    description: "Ce que le projet doit couvrir.",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    when: "après la phase pilote",
    title: "Mise en ligne",
    description: null,
  },
];

describe("ClientTimeline", () => {
  it("keeps when as the document worded it, rather than a date", () => {
    render(
      <ClientTimeline milestones={milestones} currentMilestoneId={null} />,
    );

    expect(screen.getByText("après la phase pilote")).toBeInTheDocument();
  });

  it("renders a milestone the documents added nothing to", () => {
    render(
      <ClientTimeline milestones={milestones} currentMilestoneId={null} />,
    );

    expect(screen.getByText("Mise en ligne")).toBeInTheDocument();
    expect(
      screen.getByText("Ce que le projet doit couvrir."),
    ).toBeInTheDocument();
  });

  // A plan with no position claimed is a real state: nothing is marked, and the
  // whole thing reads as ahead.
  it("claims no position when none was set", () => {
    const { container } = render(
      <ClientTimeline milestones={milestones} currentMilestoneId={null} />,
    );

    expect(container.querySelectorAll(".bg-primary")).toHaveLength(0);
  });

  // One node carries the accent, and only one — the answer to "where are we?"
  // comes from the shape before a word is read.
  it("marks exactly one node when the project has a position", () => {
    const { container } = render(
      <ClientTimeline
        milestones={milestones}
        currentMilestoneId={milestones[1].id}
      />,
    );

    expect(container.querySelectorAll(".bg-primary")).toHaveLength(1);
    expect(container.querySelectorAll(".bg-muted-foreground")).toHaveLength(1);
  });

  it("survives a position naming a milestone that is gone", () => {
    const { container } = render(
      <ClientTimeline milestones={milestones} currentMilestoneId="vanished" />,
    );

    expect(container.querySelectorAll(".bg-primary")).toHaveLength(0);
    expect(screen.getByText("Cadrage")).toBeInTheDocument();
  });

  // Left to right is how time moves. Where the project stands is a position
  // along a track, not a row in a list.
  it("reads horizontally, and falls back to a column on a phone", () => {
    const { container } = render(
      <ClientTimeline milestones={milestones} currentMilestoneId={null} />,
    );

    const rail = container.querySelector("ol");
    expect(rail).toHaveAttribute("data-orientation", "horizontal");
    expect(rail?.className).toContain("sm:flex");
    // Enough width per step that a title is read rather than hyphenated, and
    // the rail scrolls inside itself rather than crushing ten steps.
    expect(rail?.className).toContain("sm:overflow-x-auto");
    expect(container.querySelector("li")?.className).toContain("sm:min-w-40");
  });

  // The client's markers are not buttons; the developer's are, because that is
  // where the position is moved.
  it("makes the marker a control only when it is given one", async () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <ClientTimeline milestones={milestones} currentMilestoneId={null} />,
    );

    expect(screen.queryByRole("button")).toBeNull();

    rerender(
      <ClientTimeline
        milestones={milestones}
        currentMilestoneId={null}
        onSelect={onSelect}
      />,
    );
    await userEvent.setup().click(screen.getAllByRole("button")[0]);

    expect(onSelect).toHaveBeenCalledWith(milestones[0].id);
  });

  it("clears the position when the marker holding it is pressed", async () => {
    const onSelect = vi.fn();
    render(
      <ClientTimeline
        milestones={milestones}
        currentMilestoneId={milestones[0].id}
        onSelect={onSelect}
      />,
    );

    await userEvent.setup().click(screen.getAllByRole("button")[0]);

    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
