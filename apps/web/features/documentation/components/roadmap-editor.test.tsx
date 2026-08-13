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
  substeps: [],
};
const launch = {
  id: "00000000-0000-4000-8000-00000000000b",
  when: "mi-octobre",
  title: "Mise en ligne",
  description: null,
  substeps: [],
};
const featureOne = {
  id: "00000000-0000-4000-8000-00000000000c",
  when: null,
  title: "Feature 1",
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
    await user.click(screen.getByRole("menuitem", { name: "addBlankStep" }));
    const titles = screen.getAllByLabelText("titleLabel");
    await user.type(titles[titles.length - 1], "Atelier");
    const dates = screen.getAllByLabelText("whenLabel");
    await user.type(dates[dates.length - 1], "novembre");
    await user.click(screen.getByText("save"));

    expect(save.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        milestones: expect.arrayContaining([
          {
            id: null,
            when: "novembre",
            title: "Atelier",
            description: null,
            substeps: [],
          },
        ]),
      }),
    );
  });

  // Taking "Développement" from the menu gives a step with no date. Requiring
  // one left the developer with a disabled button and nothing saying why.
  it("saves a step whose date is not fixed yet", async () => {
    const user = userEvent.setup();
    renderEditor({ milestones: [] });

    await user.click(screen.getByText("addStep"));
    await user.click(screen.getByRole("menuitem", { name: "phase_build" }));
    await user.click(screen.getByText("save"));

    expect(save.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        milestones: [
          expect.objectContaining({ title: "phase_build", when: null }),
        ],
      }),
    );
  });

  it("refuses to save a step with no title — a marker over nothing", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByText("addStep"));
    await user.click(screen.getByRole("menuitem", { name: "addBlankStep" }));

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

  // The arc lives inside the one control that adds a step. On the rail the
  // phases looked like steps the roadmap already had, which was false.
  it("keeps the phases out of the timeline and inside the button that adds one", async () => {
    const user = userEvent.setup();
    renderEditor({ milestones: [] });

    expect(screen.queryByText("phase_framing")).toBeNull();

    await user.click(screen.getByText("addStep"));

    expect(screen.getByRole("menuitem", { name: "phase_framing" })).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "phase_aftercare" }),
    ).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "addBlankStep" }),
    ).toBeVisible();
  });

  it("stops offering a phase the roadmap already has", async () => {
    const user = userEvent.setup();
    // Under the test translator a phase's name is its key, so a milestone
    // already carrying that name is what "already taken" looks like here.
    renderEditor({ milestones: [{ ...framing, title: "phase_framing" }] });

    await user.click(screen.getByText("addStep"));

    expect(screen.queryByRole("menuitem", { name: "phase_framing" })).toBeNull();

    await user.click(screen.getByRole("menuitem", { name: "phase_acceptance" }));

    expect(
      screen
        .getAllByLabelText("titleLabel")
        .map((input) => (input as HTMLInputElement).value),
    ).toContain("phase_acceptance");
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

  // What is published is shown by the client's own component, so the preview
  // cannot drift from the thing. The marker stays a control: the position moves
  // without composing, approving or publishing anything.
  it("shows a published roadmap as the client's own timeline, position still movable", async () => {
    const user = userEvent.setup();
    renderEditor({ editable: false, proposalVersion: undefined });

    expect(screen.queryByLabelText("whenLabel")).toBeNull();
    expect(screen.queryByText("addStep")).toBeNull();
    await user.click(screen.getAllByRole("button")[0]);

    expect(move.mutate).toHaveBeenCalledWith({
      milestoneId: framing.id,
      expectedVersion: 4,
    });
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
    await user.click(screen.getByRole("menuitem", { name: "addBlankStep" }));

    expect(container.querySelectorAll("ol .bg-primary")).toHaveLength(0);
  });

  // "Développement" is one word for three months. Naming what sits inside it is
  // the whole point of this level.
  describe("what sits inside a step", () => {
    it("adds one with no date, and sends it with no id of its own", async () => {
      const user = userEvent.setup();
      renderEditor({ milestones: [framing] });

      await user.click(screen.getByText("addSubstep"));
      await user.type(screen.getByLabelText("substepTitleLabel"), "Feature 1");
      await user.click(screen.getByText("save"));

      expect(save.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          milestones: [
            expect.objectContaining({
              id: framing.id,
              substeps: [
                { id: null, when: null, title: "Feature 1", description: null },
              ],
            }),
          ],
        }),
      );
    });

    it("keeps the id of one it kept when its wording is corrected", async () => {
      const user = userEvent.setup();
      renderEditor({ milestones: [{ ...framing, substeps: [featureOne] }] });

      const title = screen.getByLabelText("substepTitleLabel");
      await user.clear(title);
      await user.type(title, "Feature 1 le panier");
      await user.click(screen.getByText("save"));

      expect(save.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          milestones: [
            expect.objectContaining({
              substeps: [
                expect.objectContaining({
                  id: featureOne.id,
                  title: "Feature 1 le panier",
                }),
              ],
            }),
          ],
        }),
      );
    });

    it("refuses to save one with no name", async () => {
      const user = userEvent.setup();
      renderEditor({ milestones: [framing] });

      await user.click(screen.getByText("addSubstep"));

      expect(screen.getByText("save")).toBeDisabled();
    });

    it("removes one", async () => {
      const user = userEvent.setup();
      renderEditor({ milestones: [{ ...framing, substeps: [featureOne] }] });

      // The sub-step's control sits inside the milestone's body, so it comes
      // first; the milestone's own remove follows it.
      await user.click(screen.getAllByText("remove")[0]);
      await user.click(screen.getByText("save"));

      expect(save.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          milestones: [
            expect.objectContaining({ id: framing.id, substeps: [] }),
          ],
        }),
      );
    });

    // "We are on Feature 2" is the answer "Développement" cannot give.
    it("moves the position onto one, without composing anything", async () => {
      const user = userEvent.setup();
      renderEditor({ milestones: [{ ...framing, substeps: [featureOne] }] });

      const markers = screen.getAllByRole("button", { name: "markPosition" });
      await user.click(markers[markers.length - 1]);

      expect(move.mutate).toHaveBeenCalledWith({
        milestoneId: featureOne.id,
        expectedVersion: 4,
      });
      expect(save.mutate).not.toHaveBeenCalled();
    });

    // The roadmap is two levels deep, and there is nothing here that could add
    // a third: the control belongs to the milestone, never to a sub-step.
    it("offers no way to nest one inside another", async () => {
      const user = userEvent.setup();
      renderEditor({ milestones: [{ ...framing, substeps: [featureOne] }] });

      await user.click(screen.getByText("addSubstep"));

      expect(screen.getAllByText("addSubstep")).toHaveLength(1);
    });
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
    expect(container.querySelectorAll("ol .bg-muted-foreground")).toHaveLength(1);
    const current = screen.getByRole("button", { name: "clearPosition" });
    expect(within(current).getByText("clearPosition")).toBeInTheDocument();
  });
});
