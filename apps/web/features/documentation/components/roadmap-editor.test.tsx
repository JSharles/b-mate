import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SectionView } from "schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useReplaceMilestones, useSetCurrentMilestone } from "../hooks";
import { RoadmapEditor } from "./roadmap-editor";

vi.mock("../hooks", () => ({
  useReplaceMilestones: vi.fn(),
  useSetCurrentMilestone: vi.fn(),
}));

const save = { mutate: vi.fn(), isPending: false };
const move = { mutate: vi.fn(), isPending: false };

const section: SectionView = {
  id: "00000000-0000-4000-8000-000000000001",
  kind: "roadmap",
  name: "Roadmap",
  instructions: null,
  editorial: null,
  currentMilestoneId: null,
  sortOrder: 0,
  refreshNeeded: false,
  activeProposal: null,
  hasPublishedContent: false,
  version: 4,
};

const framing = {
  id: "00000000-0000-4000-8000-00000000000a",
  when: "Q2 2026",
  title: "Cadrage",
  description: null,
};
const launch = {
  id: "00000000-0000-4000-8000-00000000000b",
  when: "mi-octobre",
  title: "Mise en ligne",
  description: null,
};

function renderEditor(props: Partial<Parameters<typeof RoadmapEditor>[0]> = {}) {
  return render(
    <RoadmapEditor
      projectId="project"
      section={section}
      milestones={[framing, launch]}
      proposalVersion={3}
      editable
      {...props}
    />,
  );
}

describe("RoadmapEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useReplaceMilestones).mockReturnValue(
      save as unknown as ReturnType<typeof useReplaceMilestones>,
    );
    vi.mocked(useSetCurrentMilestone).mockReturnValue(
      move as unknown as ReturnType<typeof useSetCurrentMilestone>,
    );
  });

  // No edit mode, no pencil, no dialog: the roadmap is the form.
  it("edits a milestone where it is, and saves only once something changed", async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(screen.queryByText("save")).not.toBeInTheDocument();

    const dates = screen.getAllByLabelText("whenLabel");
    await user.clear(dates[0]);
    await user.type(dates[0], "septembre");
    await user.click(screen.getByText("save"));

    expect(save.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedProposalVersion: 3,
        milestones: [
          expect.objectContaining({ id: framing.id, when: "septembre" }),
          expect.objectContaining({ id: launch.id }),
        ],
      }),
    );
  });

  // An id names a milestone being kept; its absence means a new one, which is
  // what tells the API to mint an id rather than look for one.
  it("sends a step the developer added with no id of its own", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByText("addStep"));
    const titles = screen.getAllByLabelText("titleLabel");
    await user.type(titles[titles.length - 1], "Atelier");
    const dates = screen.getAllByLabelText("whenLabel");
    await user.type(dates[dates.length - 1], "novembre");
    await user.click(screen.getByText("save"));

    expect(save.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        milestones: expect.arrayContaining([
          { id: null, when: "novembre", title: "Atelier", description: null },
        ]),
      }),
    );
  });

  it("refuses to save a step with no title — a marker over nothing", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByText("addStep"));

    expect(screen.getByText("save")).toBeDisabled();
  });

  it("reorders without touching what the milestones say", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getAllByText("moveDown")[0]);
    await user.click(screen.getByText("save"));

    expect(save.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        milestones: [
          expect.objectContaining({ id: launch.id }),
          expect.objectContaining({ id: framing.id }),
        ],
      }),
    );
  });

  it("removes a step", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getAllByText("remove")[0]);
    await user.click(screen.getByText("save"));

    expect(save.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        milestones: [expect.objectContaining({ id: launch.id })],
      }),
    );
  });

  // The arc continues past what the roadmap holds, and taking one adds an
  // ordinary milestone the developer owns.
  it("offers the phases the roadmap does not already have", async () => {
    const user = userEvent.setup();
    // Under the test translator a phase's name is its key, so a milestone
    // already carrying that name is what "already taken" looks like here.
    renderEditor({ milestones: [{ ...framing, title: "phase_framing" }] });

    expect(screen.queryByRole("button", { name: "phase_framing" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "phase_acceptance" }));

    expect(
      screen.getAllByLabelText("titleLabel").map((input) => (input as HTMLInputElement).value),
    ).toContain("phase_acceptance");
  });

  it("offers the whole arc on a roadmap the documents said nothing about", () => {
    renderEditor({ milestones: [] });

    expect(
      screen.getByRole("button", { name: "phase_framing" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "phase_aftercare" }),
    ).toBeInTheDocument();
  });

  // The dot is where the project stands, so the dot is the control that moves
  // it — and it moves without composing or approving anything.
  it("moves the position from the marker itself", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getAllByRole("button", { name: "markPosition" })[0]);

    expect(move.mutate).toHaveBeenCalledWith({
      milestoneId: framing.id,
      expectedVersion: 4,
    });
    expect(save.mutate).not.toHaveBeenCalled();
  });

  it("clears the position by pressing the milestone that holds it", async () => {
    const user = userEvent.setup();
    renderEditor({
      section: { ...section, currentMilestoneId: launch.id },
    });

    await user.click(screen.getByRole("button", { name: "clearPosition" }));

    expect(move.mutate).toHaveBeenCalledWith({
      milestoneId: null,
      expectedVersion: 4,
    });
  });

  // The published roadmap is read only — except where the project stands, which
  // is the one thing the developer changes weekly without a document changing.
  it("keeps the position movable on a published roadmap it cannot otherwise edit", async () => {
    const user = userEvent.setup();
    renderEditor({ editable: false, proposalVersion: undefined });

    expect(screen.queryByLabelText("whenLabel")).toBeNull();
    expect(screen.queryByText("addStep")).toBeNull();
    expect(screen.queryByRole("button", { name: "phase_acceptance" })).toBeNull();

    await user.click(screen.getAllByRole("button")[0]);

    expect(move.mutate).toHaveBeenCalled();
  });

  // A fresh composition replaces the draft rather than being masked by edits
  // made against the previous one.
  it("takes a newly composed roadmap over edits made against the old one", async () => {
    const user = userEvent.setup();
    const { rerender } = renderEditor();

    await user.type(screen.getAllByLabelText("titleLabel")[0], " revu");

    rerender(
      <RoadmapEditor
        projectId="project"
        section={section}
        milestones={[{ ...framing, title: "Atelier de cadrage" }]}
        proposalVersion={4}
        editable
      />,
    );

    const titles = screen.getAllByLabelText("titleLabel");
    expect(titles).toHaveLength(1);
    expect((titles[0] as HTMLInputElement).value).toBe("Atelier de cadrage");
  });

  it("shows what a milestone covers when it has something to add", () => {
    renderEditor({
      editable: false,
      proposalVersion: undefined,
      milestones: [{ ...framing, description: "Ateliers et périmètre." }],
    });

    expect(screen.getByText("Ateliers et périmètre.")).toBeInTheDocument();
  });

  // `null === null`: a milestone the developer has just added carries no id, and
  // neither does "no position claimed".
  it("does not let a newly added step claim the position by default", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor({ milestones: [] });

    await user.click(screen.getByText("addStep"));

    expect(container.querySelectorAll("ol .bg-primary")).toHaveLength(0);
  });
});

describe("the roadmap's markers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useReplaceMilestones).mockReturnValue(
      save as unknown as ReturnType<typeof useReplaceMilestones>,
    );
    vi.mocked(useSetCurrentMilestone).mockReturnValue(
      move as unknown as ReturnType<typeof useSetCurrentMilestone>,
    );
  });

  it("marks everything before the position as done and everything after as ahead", () => {
    const { container } = render(
      <RoadmapEditor
        projectId="project"
        section={{ ...section, currentMilestoneId: launch.id }}
        milestones={[framing, launch]}
        editable={false}
      />,
    );

    expect(container.querySelectorAll("ol .bg-primary")).toHaveLength(1);
    expect(container.querySelectorAll("ol .bg-foreground\\/50")).toHaveLength(1);
    const current = screen.getByRole("button", { name: "clearPosition" });
    expect(within(current).getByText("clearPosition")).toBeInTheDocument();
  });
});
