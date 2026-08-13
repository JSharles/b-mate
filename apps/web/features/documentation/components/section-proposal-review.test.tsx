import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SectionView } from "schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useApproveSectionProposal,
  usePublicClientSections,
  useSectionProposal,
} from "../hooks";
import { SectionProposalReview } from "./section-proposal-review";

vi.mock("../hooks", () => ({
  usePublicClientSections: vi.fn(),
  useSectionProposal: vi.fn(),
  useApproveSectionProposal: vi.fn(),
  // Reached through the roadmap editor this component renders for a roadmap.
  useReplaceMilestones: () => ({ mutate: vi.fn(), isPending: false }),
  useSetCurrentMilestone: () => ({ mutate: vi.fn(), isPending: false }),
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
  kind: "prose" as const,
  instructions: "La demande initiale et ses contraintes.",
  currentMilestoneId: null,
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

function withPublished(live: unknown) {
  vi.mocked(usePublicClientSections).mockReturnValue({
    data: live ? [live] : [],
    isPending: false,
    isError: false,
  } as never);
}

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
    withPublished(undefined);
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

  // What the client reads is not what the developer reviews: the proposal is
  // the factual layer in their own language, the published text is derived
  // from it. Showing only the proposal left no way to see what the client gets.
  it("shows what the client reads once nothing is waiting", () => {
    withProposal({ ...readyProposal, status: "approved" });
    withPublished({
      id: section.id,
      name: section.name,
      blocks: [{ type: "paragraph", text: "Le texte que lit votre client." }],
    });

    render(<SectionProposalReview projectId="project-1" section={section} />);

    expect(screen.getByText("liveLabel")).toBeVisible();
    expect(screen.getByText("Le texte que lit votre client.")).toBeVisible();
  });

  // A proposal is not yet what anyone reads, and saying so is what stops it
  // being mistaken for the client's copy.
  it("says a proposal is waiting, and that the client still reads the old one", () => {
    withProposal(readyProposal);
    withPublished({
      id: section.id,
      name: section.name,
      blocks: [{ type: "paragraph", text: "Le texte que lit votre client." }],
    });

    render(<SectionProposalReview projectId="project-1" section={section} />);

    expect(screen.getByText("pendingOverLive")).toBeVisible();
    expect(screen.getByText("Le lancement est prévu en octobre.")).toBeVisible();
  });

  it("says a proposal is waiting when the client has nothing yet", () => {
    withProposal(readyProposal);

    render(<SectionProposalReview projectId="project-1" section={section} />);

    expect(screen.getByText("pendingLabel")).toBeVisible();
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

// A roadmap has no separate review: what the developer edits is the timeline
// itself, and there is no "nothing matched" dead end because the phases every
// project runs through are already on the rail.
describe("SectionProposalReview, on a roadmap", () => {
  const roadmap: SectionView = {
    ...section,
    kind: "roadmap",
    instructions: null,
    editorial: null,
  };
  const milestone = {
    id: "00000000-0000-4000-8000-00000000000a",
    when: "Q3 2026",
    title: "Recette",
    description: null,
    substeps: [],
    origin: "document" as const,
  };

  it("shows the timeline it is offering rather than paragraphs", () => {
    withPublished(undefined);
    withProposal({
      status: "pending_review",
      outcome: "composed",
      version: 2,
      blocks: [],
      milestones: [milestone],
    });

    render(<SectionProposalReview projectId="project-1" section={roadmap} />);

    expect(screen.getByDisplayValue("Recette")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "approve" })).toBeVisible();
  });

  // Publishing an empty roadmap gives the client a tab with nothing in it and
  // no way to know why. The empty rail above says it; the button does not need
  // a sentence.
  it("will not publish a roadmap with nothing in it", () => {
    withPublished(undefined);
    withProposal({
      status: "pending_review",
      outcome: "nothing_matched",
      version: 2,
      blocks: [],
      milestones: [],
    });

    render(<SectionProposalReview projectId="project-1" section={roadmap} />);

    expect(screen.getByRole("button", { name: "approve" })).toBeDisabled();
  });

  // FR-009: a roadmap the documents said nothing about is a starting point, not
  // a dead end.
  it("offers the phases when the documents held no sequence at all", async () => {
    withPublished(undefined);
    withProposal({
      status: "pending_review",
      outcome: "nothing_matched",
      version: 2,
      blocks: [],
      milestones: [],
    });

    render(<SectionProposalReview projectId="project-1" section={roadmap} />);
    await userEvent.setup().click(screen.getByText("addStep"));

    expect(
      screen.getByRole("menuitem", { name: "phase_framing" }),
    ).toBeVisible();
  });

  // Nothing is waiting on the developer, so the rubrique shows the one timeline
  // that still matters: the one their client is reading.
  it("falls back to the published timeline once nothing is pending", () => {
    withPublished({
      kind: "roadmap",
      id: roadmap.id,
      name: roadmap.name,
      milestones: [{ ...milestone, origin: undefined }],
      currentMilestoneId: null,
    });
    withProposal({
      status: "approved",
      outcome: "composed",
      version: 3,
      blocks: [],
      milestones: [milestone],
    });

    render(<SectionProposalReview projectId="project-1" section={roadmap} />);

    expect(screen.getByText("Recette")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "approve" })).toBeNull();
  });

  it("says so when nothing has been written and nothing is published", () => {
    withPublished(undefined);
    withProposal(null);

    render(<SectionProposalReview projectId="project-1" section={roadmap} />);

    expect(screen.getByText("neverComposed")).toBeInTheDocument();
  });
});
