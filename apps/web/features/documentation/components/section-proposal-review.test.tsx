import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SectionView } from "schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useApproveSectionProposal, useSectionProposal } from "../hooks";
import { SectionProposalReview } from "./section-proposal-review";

vi.mock("../hooks", () => ({
  useSectionProposal: vi.fn(),
  useApproveSectionProposal: vi.fn(),
}));

const approve = {
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null,
};

const section: SectionView = {
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
  refreshNeeded: false,
  activeProposal: null,
  hasPublishedContent: false,
  version: 1,
};

function withProposal(data: unknown, isPending = false) {
  vi.mocked(useSectionProposal).mockReturnValue({
    data,
    isPending,
    isError: false,
  } as never);
}

const readyProposal = {
  id: "proposal-1",
  status: "pending_review",
  outcome: "composed",
  version: 2,
  blocks: [{ kind: "paragraph", text: "Le lancement est prévu en octobre." }],
};

describe("SectionProposalReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApproveSectionProposal).mockReturnValue(approve as never);
  });

  it("says the section has never been written", () => {
    withProposal(null);

    render(<SectionProposalReview projectId="project-1" section={section} />);

    expect(screen.getByText("neverComposed")).toBeVisible();
  });

  it("says it is being written, and offers nothing to approve yet", () => {
    withProposal({ ...readyProposal, status: "composing", blocks: [] });

    render(<SectionProposalReview projectId="project-1" section={section} />);

    expect(screen.getByText("composing")).toBeVisible();
    expect(screen.queryByRole("button", { name: "approve" })).not.toBeInTheDocument();
  });

  // A failed composition leaves the published version readable, so it is a
  // retry rather than an incident.
  it("reports a failure without implying the client lost anything", () => {
    withProposal({ ...readyProposal, status: "failed" });

    render(<SectionProposalReview projectId="project-1" section={section} />);

    expect(screen.getByText("failed")).toBeVisible();
  });

  // FR-011: "nothing matched" is stated, not left as an empty body the
  // contributor has to interpret.
  it("says plainly when nothing in the source matched the brief", () => {
    withProposal({ ...readyProposal, outcome: "nothing_matched", blocks: [] });

    render(<SectionProposalReview projectId="project-1" section={section} />);

    expect(screen.getByText("nothingMatched")).toBeVisible();
    expect(screen.queryByRole("button", { name: "approve" })).not.toBeInTheDocument();
  });

  it("shows the proposed content with its approve action", () => {
    withProposal(readyProposal);

    render(<SectionProposalReview projectId="project-1" section={section} />);

    expect(screen.getByText("Le lancement est prévu en octobre.")).toBeVisible();
    expect(screen.getByRole("button", { name: "approve" })).toBeVisible();
  });

  // The box alone said nothing: a developer asked what it was, which answers
  // whether it worked. What is not settled says so, and says where to settle it.
  it("names what an unsettled passage is, and where it gets settled", () => {
    withProposal({
      ...readyProposal,
      blocks: [
        { kind: "paragraph", text: "Le lancement est prévu en octobre." },
        { kind: "open_point", text: "Le modèle de permission est remis en question." },
      ],
    });

    render(<SectionProposalReview projectId="project-1" section={section} />);

    expect(screen.getByText("openPointLabel")).toBeVisible();
    expect(screen.getByText("openPointHint")).toBeVisible();
  });

  it("says nothing of the sort about a settled passage", () => {
    withProposal(readyProposal);

    render(<SectionProposalReview projectId="project-1" section={section} />);

    expect(screen.queryByText("openPointLabel")).not.toBeInTheDocument();
  });

  // Questions per rubrique were a second place to answer what the reference
  // document already asks. There is one place, and it is the document.
  it("asks nothing of its own", () => {
    withProposal(readyProposal);

    render(<SectionProposalReview projectId="project-1" section={section} />);

    expect(screen.queryByText("questionsHint")).not.toBeInTheDocument();
  });

  // FR-012: approving names the version the contributor actually read, so a
  // proposal replaced under them is refused rather than approved unseen.
  it("approves at the version it displayed", async () => {
    withProposal(readyProposal);
    const user = userEvent.setup();

    render(<SectionProposalReview projectId="project-1" section={section} />);
    await user.click(screen.getByRole("button", { name: "approve" }));

    expect(approve.mutate).toHaveBeenCalledWith(2);
  });

  it("offers no approval on a proposal already approved", () => {
    withProposal({ ...readyProposal, status: "approved" });

    render(<SectionProposalReview projectId="project-1" section={section} />);

    expect(screen.getByText("Le lancement est prévu en octobre.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "approve" })).not.toBeInTheDocument();
  });

  // A failed fetch is not a section that was never written: it announced "not
  // written yet" for a section holding published content, and offered a
  // rewrite as the fix for a network error.
  it("says the proposal failed to load rather than claiming none exists", () => {
    vi.mocked(useSectionProposal).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as never);

    render(<SectionProposalReview projectId="project-1" section={section} />);

    expect(screen.getByRole("alert")).toHaveTextContent("loadError");
    expect(screen.queryByText("neverComposed")).not.toBeInTheDocument();
  });

  // Composition finishes by poll, not by user action, so the result appears
  // with nothing to announce it.
  it("announces the composed content when it arrives", () => {
    withProposal(readyProposal);

    render(<SectionProposalReview projectId="project-1" section={section} />);

    expect(
      screen.getByText("Le lancement est prévu en octobre.").closest("[aria-live]"),
    ).toHaveAttribute("aria-live", "polite");
  });
});
