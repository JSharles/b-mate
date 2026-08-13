import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SectionView } from "schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useArchiveSection } from "../hooks";
import { DeleteSectionDialog } from "./delete-section-dialog";

vi.mock("../hooks", () => ({ useArchiveSection: vi.fn() }));

const archive = { mutate: vi.fn(), isPending: false, isError: false };

function section(overrides: Partial<SectionView> = {}): SectionView {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Planning",
    instructions: "Les jalons.",
    editorial: {
      length: "balanced",
      pedagogy: "guided",
      technicalFamiliarity: "novice",
      tone: "reassuring",
    },
    sortOrder: 0,
    refreshNeeded: false,
    exclusionCount: 0,
    activeProposal: null,
    hasPublishedContent: true,
    version: 1,
    ...overrides,
  };
}

describe("DeleteSectionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useArchiveSection).mockReturnValue(archive as never);
  });

  it("names the section being deleted", () => {
    render(
      <DeleteSectionDialog
        projectId="project-1"
        section={section()}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("alertdialog")).toHaveAccessibleName(/title/);
  });

  // The consequence is what the contributor needs, and it differs: one takes a
  // heading away from someone reading it, the other costs nothing.
  it("warns that a published section disappears from the client's view", () => {
    render(
      <DeleteSectionDialog
        projectId="project-1"
        section={section({ hasPublishedContent: true })}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText("publishedConsequence")).toBeVisible();
  });

  it("says plainly that deleting an unpublished section costs nothing", () => {
    render(
      <DeleteSectionDialog
        projectId="project-1"
        section={section({ hasPublishedContent: false })}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText("unpublishedConsequence")).toBeVisible();
  });

  it("archives only once confirmed", async () => {
    const user = userEvent.setup();
    render(
      <DeleteSectionDialog
        projectId="project-1"
        section={section({ id: "section-9" })}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(archive.mutate).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "confirm" }));

    expect(archive.mutate).toHaveBeenCalledWith("section-9", expect.anything());
  });

  it("keeps the dialog open and says so when deleting fails", () => {
    vi.mocked(useArchiveSection).mockReturnValue({
      ...archive,
      isError: true,
    } as never);

    render(
      <DeleteSectionDialog
        projectId="project-1"
        section={section()}
        open
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("error");
  });
});
