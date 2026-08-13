import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
