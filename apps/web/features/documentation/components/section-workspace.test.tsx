import { fireEvent, render, screen } from "@testing-library/react";
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

  // The tab carries the state, so the one rubrique waiting on a decision is
  // visible without opening any of them.
  it("says where each rubrique stands on its own tab", () => {
    withSections([
      section({ activeProposal: { status: "pending_review" } }),
      section({ id: "section-2", name: "Planning", refreshNeeded: true }),
    ]);

    render(<SectionWorkspace projectId="project-1" />);

    expect(screen.getByText("state_awaiting")).toBeVisible();
    expect(screen.getByText("state_never")).toBeVisible();
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
