import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SectionView } from "schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useComposeSection, useSections } from "../hooks";
import { SectionList } from "./section-list";

vi.mock("../hooks", () => ({
  useSections: vi.fn(),
  useComposeSection: vi.fn(),
}));
vi.mock("./section-proposal-review", () => ({
  SectionProposalReview: () => <div>proposal-review</div>,
}));
vi.mock("./section-editor-dialog", () => ({
  SectionEditorDialog: ({ open }: { open: boolean }) =>
    open ? <div>editor-dialog</div> : null,
}));
vi.mock("./delete-section-dialog", () => ({
  DeleteSectionDialog: ({ open }: { open: boolean }) =>
    open ? <div>delete-dialog</div> : null,
}));

const compose = { mutate: vi.fn(), isPending: false };

function section(overrides: Partial<SectionView> = {}): SectionView {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Ce que le client a demandé",
    instructions: "La demande initiale et ses contraintes.",
    editorial: {
      length: "balanced",
      pedagogy: "guided",
      technicalFamiliarity: "novice",
      tone: "reassuring",
    },
    sortOrder: 0,
    refreshNeeded: true,
    exclusionCount: 0,
    activeProposal: null,
    hasPublishedContent: false,
    version: 1,
    ...overrides,
  };
}

function withSections(sections: SectionView[], isPending = false) {
  vi.mocked(useSections).mockReturnValue({
    data: { sections },
    isPending,
    isError: false,
  } as never);
}

describe("SectionList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useComposeSection).mockReturnValue(compose as never);
  });

  // FR-005: a project starts with no sections, and the area says so plainly
  // rather than showing an empty list and leaving the contributor to guess.
  describe("with nothing created yet", () => {
    it("explains what a section is and offers to create the first", () => {
      withSections([]);

      render(<SectionList projectId="project-1" />);

      expect(screen.getByText("emptyTitle")).toBeVisible();
      expect(screen.getByText("emptyDescription")).toBeVisible();
      expect(screen.getByRole("button", { name: /createFirst/ })).toBeVisible();
    });

    it("opens the editor from the empty state", async () => {
      withSections([]);
      const user = userEvent.setup();

      render(<SectionList projectId="project-1" />);
      await user.click(screen.getByRole("button", { name: /createFirst/ }));

      expect(screen.getByText("editor-dialog")).toBeVisible();
    });
  });

  describe("each section's state", () => {
    it.each([
      ["never", {}],
      ["composing", { activeProposal: { status: "composing" } }],
      ["awaiting", { activeProposal: { status: "pending_review" } }],
      ["stale", { refreshNeeded: true, hasPublishedContent: true }],
      ["published", { refreshNeeded: false }],
    ])("reads as %s", (state, overrides) => {
      withSections([section(overrides as Partial<SectionView>)]);

      render(<SectionList projectId="project-1" />);

      expect(screen.getByText(`state_${state}`)).toBeVisible();
    });

    // One composition per section at a time (FR-013): offering the action while
    // one runs would only produce a refusal the contributor did not expect.
    it("offers no writing action while one is running", () => {
      withSections([
        section({ activeProposal: { status: "composing" } as never }),
      ]);

      render(<SectionList projectId="project-1" />);

      expect(screen.queryByRole("button", { name: /compose|refresh/ })).not.toBeInTheDocument();
    });

    it("calls it a refresh once the client has something to read", () => {
      withSections([section({ hasPublishedContent: true })]);

      render(<SectionList projectId="project-1" />);

      expect(screen.getByRole("button", { name: /refresh/ })).toBeVisible();
      expect(screen.queryByRole("button", { name: /^compose$/ })).not.toBeInTheDocument();
    });
  });

  it("shows the brief a contributor wrote, since it is what produced the content", () => {
    withSections([section()]);

    render(<SectionList projectId="project-1" />);

    expect(
      screen.getByText("La demande initiale et ses contraintes."),
    ).toBeVisible();
  });

  it("triggers a composition for the section it belongs to", async () => {
    withSections([section({ id: "section-9" })]);
    const user = userEvent.setup();

    render(<SectionList projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: /compose/ }));

    expect(compose.mutate).toHaveBeenCalledWith("section-9");
  });

  // Deleting takes a heading away from someone who is reading it. Removing a
  // document already asks first; this asks for the same reason.
  it("asks before deleting rather than deleting on the click", async () => {
    withSections([section({ id: "section-9" })]);
    const user = userEvent.setup();

    render(<SectionList projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: /delete/ }));

    expect(screen.getByText("delete-dialog")).toBeVisible();
  });

  it("gives every section its own proposal review", () => {
    withSections([
      section({ id: "section-1" }),
      section({ id: "section-2", name: "Planning" }),
    ]);

    render(<SectionList projectId="project-1" />);

    expect(screen.getAllByText("proposal-review")).toHaveLength(2);
  });

  it("keeps the heading in place while sections load", () => {
    withSections([], true);

    render(<SectionList projectId="project-1" />);

    expect(screen.getByRole("heading", { name: /title2/ })).toBeVisible();
    expect(screen.getByLabelText("loading")).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  // A failed fetch is not an empty project: the empty state told a contributor
  // with eight published sections that they had none.
  it("says the list failed to load rather than claiming there are none", () => {
    vi.mocked(useSections).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as never);

    render(<SectionList projectId="project-1" />);

    expect(screen.getByRole("alert")).toHaveTextContent("loadError");
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });

  // One state asks for a decision; the other four report. Down a long list the
  // difference has to be visible without reading every pill.
  it("marks only the section awaiting review with the interactive colour", () => {
    withSections([
      section({ id: "a", activeProposal: { status: "pending_review" } as never }),
      section({ id: "b", refreshNeeded: false }),
    ]);

    render(<SectionList projectId="project-1" />);

    expect(screen.getByText("state_awaiting").className).toContain("text-primary");
    expect(screen.getByText("state_published").className).toContain(
      "text-muted-foreground",
    );
  });

  // One mutation object serves every row: keyed only on `isPending`, starting a
  // composition on one section would disable the action on all of them.
  it("disables only the section being composed", () => {
    vi.mocked(useComposeSection).mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
      variables: "section-1",
    } as never);
    withSections([
      section({ id: "section-1" }),
      section({ id: "section-2", name: "Planning" }),
    ]);

    render(<SectionList projectId="project-1" />);

    const [first, second] = screen.getAllByRole("button", { name: /compose/ });
    expect(first).toBeDisabled();
    expect(second).toBeEnabled();
  });
});
