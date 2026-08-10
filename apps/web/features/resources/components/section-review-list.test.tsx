import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Resource } from "schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useApproveResourceSection,
  useMoveResourceSection,
  useRejectResourceSection,
} from "../hooks";
import { SectionReviewList } from "./section-review-list";

vi.mock("../hooks", () => ({
  useApproveResourceSection: vi.fn(),
  useRejectResourceSection: vi.fn(),
  useMoveResourceSection: vi.fn(),
}));

const mockedUseApprove = vi.mocked(useApproveResourceSection);
const mockedUseReject = vi.mocked(useRejectResourceSection);
const mockedUseMove = vi.mocked(useMoveResourceSection);

// Deliberately loose: the three hooks differ in their variables type (move
// also carries a categoryKey), and the tests only ever assert on `mutate`.
function mutationStub<T>(mutate = vi.fn()): T {
  return { mutate, isPending: false } as unknown as T;
}

function resourceWithSections(sections: Resource["sections"]): Resource {
  return {
    id: "resource-1",
    projectId: "project-1",
    source: "upload",
    status: "ready_for_review",
    title: "Architecture overview",
    originalFileUrl: null,
    originalFileName: "a.pdf",
    originalFileMimeType: "application/pdf",
    notionPageUrl: null,
    failureReason: null,
    publishedAt: null,
    createdAt: "2026-08-08T00:00:00.000Z",
    sections,
  };
}

const proposedSection = {
  id: "section-1",
  categoryKey: "overview" as const,
  status: "proposed" as const,
  title: "What this delivers",
  content: "The overview slice.",
};

describe("SectionReviewList", () => {
  beforeEach(() => {
    mockedUseApprove.mockReturnValue(mutationStub());
    mockedUseReject.mockReturnValue(mutationStub());
    mockedUseMove.mockReturnValue(mutationStub());
  });

  it("shows each section's category, title and full content", () => {
    render(
      <SectionReviewList
        projectId="project-1"
        resource={resourceWithSections([proposedSection])}
      />,
    );

    // Twice on a proposed section: once as the category chip, once as the
    // current value of the move control.
    expect(screen.getAllByText("Le projet")).not.toHaveLength(0);
    expect(screen.getByRole("heading", { name: "What this delivers" })).toBeInTheDocument();
    expect(screen.getByText("The overview slice.")).toBeInTheDocument();
  });

  it("approves one section without touching the others", async () => {
    const mutate = vi.fn();
    mockedUseApprove.mockReturnValue(mutationStub(mutate));
    const user = userEvent.setup();
    render(
      <SectionReviewList
        projectId="project-1"
        resource={resourceWithSections([
          proposedSection,
          { ...proposedSection, id: "section-2", categoryKey: "planning", title: "Dates" },
        ])}
      />,
    );

    await user.click(screen.getAllByRole("button", { name: "sectionApprove" })[0]);

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({
      resourceId: "resource-1",
      sectionId: "section-1",
    });
  });

  it("rejects one section", async () => {
    const mutate = vi.fn();
    mockedUseReject.mockReturnValue(mutationStub(mutate));
    const user = userEvent.setup();
    render(
      <SectionReviewList
        projectId="project-1"
        resource={resourceWithSections([proposedSection])}
      />,
    );

    await user.click(screen.getByRole("button", { name: "sectionReject" }));

    expect(mutate).toHaveBeenCalledWith({
      resourceId: "resource-1",
      sectionId: "section-1",
    });
  });

  // research.md Decision 4: re-filing is offered only while a section is
  // still proposed — moving it afterwards would silently pull it out of a tab
  // a client is already reading.
  it("shows the decided state instead of controls once a section is approved or rejected", () => {
    render(
      <SectionReviewList
        projectId="project-1"
        resource={resourceWithSections([
          { ...proposedSection, status: "approved" },
          { ...proposedSection, id: "section-2", status: "rejected", title: "Dates" },
        ])}
      />,
    );

    expect(screen.getByText("sectionApproved")).toBeInTheDocument();
    expect(screen.getByText("sectionRejected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "sectionApprove" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  // FR-001: the four categories are the only possible destinations — a
  // free-text or open-ended control here would reintroduce exactly the drift
  // this feature removed.
  it("offers the move control preset to the section's current category", () => {
    render(
      <SectionReviewList
        projectId="project-1"
        resource={resourceWithSections([proposedSection])}
      />,
    );

    const trigger = screen.getByRole("combobox", { name: "sectionMoveLabel" });
    expect(trigger).toHaveTextContent("Le projet");
  });

  it("shows nothing to review when the analysis produced no section", () => {
    render(
      <SectionReviewList projectId="project-1" resource={resourceWithSections([])} />,
    );

    expect(screen.getByText("reviewEmpty")).toBeInTheDocument();
  });
});
