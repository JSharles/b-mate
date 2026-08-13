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
    substeps: [],
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    when: "après la phase pilote",
    title: "Mise en ligne",
    description: null,
    substeps: [],
  },
];

const featureOne = {
  id: "00000000-0000-4000-8000-00000000000a",
  when: null,
  title: "Feature 1 — le panier",
  description: null,
};
const featureTwo = {
  id: "00000000-0000-4000-8000-00000000000b",
  when: "juillet",
  title: "Feature 2 — le paiement",
  description: null,
};
const withSubsteps = [
  milestones[0],
  { ...milestones[1], title: "Développement", substeps: [featureOne, featureTwo] },
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

  // Horizontal was tried and read well on a bare rail, but a step that contains
  // things needs more than a two-hundred-pixel column. A timeline is scanned
  // rather than read, so it also takes the width it is given: the prose measure
  // was buying nothing here and leaving half the page empty.
  it("reads down the page, across the width it is given", () => {
    const { container } = render(
      <ClientTimeline milestones={milestones} currentMilestoneId={null} />,
    );

    const rail = container.querySelector("ol");
    expect(rail).not.toHaveAttribute("data-orientation");
    expect(rail?.className).not.toContain("max-w");
    expect(rail?.className).not.toContain("flex");
  });

  // The date anchors the right edge and the title the left, so the row spans
  // the width instead of huddling against the rail.
  it("sets the date against the title rather than above it", () => {
    render(
      <ClientTimeline milestones={milestones} currentMilestoneId={null} />,
    );

    const row = screen.getByText("Cadrage").parentElement;
    expect(row?.className).toContain("justify-between");
    expect(row?.textContent).toContain("Q2 2026");
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

// "Développement" is one word for three months. Naming what sits inside it is
// the difference between a roadmap that informs and one that reassures.
describe("what sits inside a milestone", () => {
  it("lists the steps under the phase that contains them", () => {
    render(
      <ClientTimeline milestones={withSubsteps} currentMilestoneId={null} />,
    );

    expect(screen.getByText("Feature 1 — le panier")).toBeInTheDocument();
    expect(screen.getByText("juillet")).toBeInTheDocument();
  });

  // "Feature 2 of five" says something "Développement" cannot.
  it("reads the phase as under way when the position names a step inside it", () => {
    const { container } = render(
      <ClientTimeline
        milestones={withSubsteps}
        currentMilestoneId={featureTwo.id}
      />,
    );

    // One accent on the phase, one on the step: the phase in progress and the
    // step in progress can never disagree, because they are resolved together.
    expect(container.querySelectorAll(".bg-primary")).toHaveLength(2);
    // Cadrage is behind it, and so is Feature 1.
    expect(container.querySelectorAll(".bg-muted-foreground")).toHaveLength(2);
  });

  // Every step of a finished phase is finished.
  it("carries a finished phase's state down to its steps", () => {
    const { container } = render(
      <ClientTimeline
        milestones={[withSubsteps[1], withSubsteps[0]]}
        currentMilestoneId={milestones[0].id}
      />,
    );

    // Développement is done, and both of its features with it.
    expect(container.querySelectorAll(".bg-muted-foreground")).toHaveLength(3);
  });

  it("claims no position inside a phase that has none", () => {
    const { container } = render(
      <ClientTimeline
        milestones={withSubsteps}
        currentMilestoneId={withSubsteps[1].id}
      />,
    );

    // The phase itself, and neither of its steps.
    expect(container.querySelectorAll(".bg-primary")).toHaveLength(1);
  });

  it("lets the developer move the position onto a step", async () => {
    const onSelect = vi.fn();
    render(
      <ClientTimeline
        milestones={withSubsteps}
        currentMilestoneId={null}
        onSelect={onSelect}
      />,
    );

    const markers = screen.getAllByRole("button");
    await userEvent.setup().click(markers[markers.length - 1]);

    expect(onSelect).toHaveBeenCalledWith(featureTwo.id);
  });
});
