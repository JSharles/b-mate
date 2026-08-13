import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useComposeSection, useSections } from "../hooks";
import { SectionWorkspace } from "./section-workspace";

vi.mock("../hooks", () => ({
  useSections: vi.fn(),
  useComposeSection: vi.fn(),
}));
vi.mock("./section-proposal-review", () => ({
  SectionProposalReview: ({ section }: { section: { id: string } }) => (
    <div>review:{section.id}</div>
  ),
}));
vi.mock("./section-editor-dialog", () => ({
  SectionEditorDialog: ({ open }: { open: boolean }) =>
    open ? <div>editor-dialog</div> : null,
}));
vi.mock("./delete-section-dialog", () => ({
  DeleteSectionDialog: ({ open }: { open: boolean }) =>
    open ? <div>delete-dialog</div> : null,
}));

const compose = vi.fn();

function section(overrides: Record<string, unknown> = {}) {
  return {
    id: "section-1",
    name: "Le projet",
    instructions: "Ce que le client a demandé.",
    editorial: {
      length: "balanced",
      pedagogy: "guided",
      technicalFamiliarity: "novice",
      tone: "reassuring",
    },
    sortOrder: 0,
    refreshNeeded: true,
    activeProposal: null,
    hasPublishedContent: false,
    version: 1,
    ...overrides,
  };
}

function withSections(sections: unknown[], overrides: Record<string, unknown> = {}) {
  vi.mocked(useSections).mockReturnValue({
    data: { sections },
    isPending: false,
    isError: false,
    ...overrides,
  } as never);
}

describe("SectionWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useComposeSection).mockReturnValue({
      mutate: compose,
      isPending: false,
      variables: undefined,
    } as never);
  });

  // The developer reads their documentation the way their client will: one
  // rubrique per tab. The list-plus-separate-preview said it twice, and
  // unfolded every proposal in full down one scroll.
  it("gives each rubrique its own tab, and opens the first", () => {
    withSections([
      section(),
      section({ id: "section-2", name: "Planning et jalons" }),
    ]);

    render(<SectionWorkspace projectId="project-1" />);

    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByText("review:section-1")).toBeVisible();
    expect(screen.queryByText("review:section-2")).not.toBeInTheDocument();
  });

  it("opens the rubrique whose tab is chosen", async () => {
    withSections([
      section(),
      section({ id: "section-2", name: "Planning et jalons" }),
    ]);
    const user = userEvent.setup();

    render(<SectionWorkspace projectId="project-1" />);
    await user.click(screen.getByRole("tab", { name: /Planning et jalons/ }));

    expect(screen.getByText("review:section-2")).toBeVisible();
  });

  // A pill of text beside the name read as a second tab, and a row of them as
  // twice the tabs there are. The tab carries a mark; the panel carries words.
  it("marks the tab without putting a second label on it", () => {
    withSections([
      section({ activeProposal: { status: "pending_review" } }),
      section({ id: "section-2", name: "Planning" }),
    ]);

    render(<SectionWorkspace projectId="project-1" />);
    const [tab] = screen.getAllByRole("tab");

    // Said for a screen reader, never drawn as a chip beside the name.
    expect(tab).toHaveAccessibleName(/state_awaiting/);
    expect(tab.querySelector(".bg-primary")).not.toBeNull();
  });

  it("spells the state out in the panel, where there is room", () => {
    withSections([section({ activeProposal: { status: "pending_review" } })]);

    render(<SectionWorkspace projectId="project-1" />);

    expect(
      screen.getByRole("tabpanel").querySelector(".bg-primary\\/15"),
    ).not.toBeNull();
  });

  it("offers the actions the client does not get", () => {
    withSections([section()]);

    render(<SectionWorkspace projectId="project-1" />);
    fireEvent.click(screen.getByRole("button", { name: /compose/ }));

    expect(compose).toHaveBeenCalledWith("section-1");
    expect(screen.getByRole("button", { name: /edit/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /delete/ })).toBeVisible();
  });

  // One mutation object serves every tab, so `isPending` alone would disable
  // the action on all of them the moment any one is clicked.
  it("only busies the rubrique whose write was asked for", () => {
    withSections([section()]);
    vi.mocked(useComposeSection).mockReturnValue({
      mutate: compose,
      isPending: true,
      variables: "section-2",
    } as never);

    render(<SectionWorkspace projectId="project-1" />);

    expect(screen.getByRole("button", { name: /compose/ })).not.toBeDisabled();
  });

  it("offers no write while one is already running", () => {
    withSections([section({ activeProposal: { status: "composing" } })]);

    render(<SectionWorkspace projectId="project-1" />);

    expect(
      screen.queryByRole("button", { name: /compose/ }),
    ).not.toBeInTheDocument();
  });

  // Pressing it on a rubrique that already holds a proposal is asking for
  // another go, not a first one — and it used to be refused in silence.
  it("offers another go at a rubrique waiting to be read", () => {
    withSections([section({ activeProposal: { status: "pending_review" } })]);

    render(<SectionWorkspace projectId="project-1" />);
    fireEvent.click(screen.getByRole("button", { name: /recompose/ }));

    expect(compose).toHaveBeenCalledWith("section-1");
  });

  // Three jobs behind one button, so it names the one it is doing.
  it.each([
    [{}, "compose"],
    [{ refreshNeeded: true, hasPublishedContent: true }, "refresh"],
    [{ activeProposal: { status: "pending_review" } }, "recompose"],
    [{ refreshNeeded: false, hasPublishedContent: true }, "recompose"],
  ])("names the job it is about to do (%#)", (overrides, label) => {
    withSections([section(overrides)]);

    render(<SectionWorkspace projectId="project-1" />);

    expect(
      screen.getByRole("button", { name: new RegExp(label) }),
    ).toBeVisible();
  });

  // Each control sits beside what it changes: the two that act on what was
  // asked for stay with the brief, the one that rewrites the text goes with
  // the text. Side by side they needed a sentence to tell them apart.
  it("puts the rewrite with the text, not with the brief", () => {
    withSections([section()]);

    render(<SectionWorkspace projectId="project-1" />);
    const panel = screen.getByRole("tabpanel");
    const brief = screen.getByText("Ce que le client a demandé.").parentElement!
      .parentElement!;

    expect(within(brief).getByRole("button", { name: /edit/ })).toBeVisible();
    expect(
      within(brief).queryByRole("button", { name: /compose/ }),
    ).not.toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /compose/ })).toBeVisible();
  });

  it("invites a first rubrique when there are none", () => {
    withSections([]);

    render(<SectionWorkspace projectId="project-1" />);

    expect(screen.getByText("emptyTitle")).toBeVisible();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /createFirst/ }));
    expect(screen.getByText("editor-dialog")).toBeVisible();
  });

  // A failed fetch is not an empty project: it told a developer with eight
  // published rubriques that they had none.
  it("says the rubriques failed to load rather than showing none", () => {
    withSections([], { data: undefined, isError: true });

    render(<SectionWorkspace projectId="project-1" />);

    expect(screen.getByRole("alert")).toHaveTextContent("loadError");
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });
});
