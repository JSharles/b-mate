import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SectionView } from "schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCreateSection, useUpdateSection } from "../hooks";
import { SectionEditorDialog } from "./section-editor-dialog";

vi.mock("../hooks", () => ({
  useCreateSection: vi.fn(),
  useUpdateSection: vi.fn(),
}));

const create = { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null };
const update = { mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null };

const section: SectionView = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Ce que le client a demandé",
  instructions: "La demande initiale et ses contraintes.",
  editorial: {
    length: "concise",
    pedagogy: "direct",
    technicalFamiliarity: "technical",
    tone: "formal",
  },
  sortOrder: 0,
  refreshNeeded: false,
  activeProposal: null,
  hasPublishedContent: true,
  version: 3,
};

describe("SectionEditorDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCreateSection).mockReturnValue(create as never);
    vi.mocked(useUpdateSection).mockReturnValue(update as never);
  });

  it("offers starting points before it offers a form", () => {
    render(<SectionEditorDialog projectId="project-1" open onOpenChange={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: /suggestion_overview_name/ }),
    ).toBeVisible();
    expect(screen.queryByLabelText("nameLabel")).not.toBeInTheDocument();
  });

  // FR-004a: the suggestion's real payload is its worked description, not its
  // title — that is what teaches a contributor what a usable brief looks like.
  it("prefills both the name and the worked description from a suggestion", async () => {
    const user = userEvent.setup();
    render(<SectionEditorDialog projectId="project-1" open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /suggestion_planning_name/ }));

    expect(screen.getByLabelText("nameLabel")).toHaveValue(
      "suggestion_planning_name",
    );
    expect(screen.getByLabelText("instructionsLabel")).toHaveValue(
      "suggestion_planning_instructions",
    );
  });

  // FR-004b: a section created from a suggestion must be editable in every
  // respect and indistinguishable afterwards from one typed blank.
  it("leaves every prefilled field editable", async () => {
    const user = userEvent.setup();
    render(<SectionEditorDialog projectId="project-1" open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /suggestion_overview_name/ }));
    const name = screen.getByLabelText("nameLabel");
    await user.clear(name);
    await user.type(name, "Mon titre");

    expect(name).toHaveValue("Mon titre");
    expect(name).not.toHaveAttribute("readonly");
    expect(screen.getByLabelText("instructionsLabel")).not.toHaveAttribute(
      "readonly",
    );
  });

  it("opens on a blank form when a free title is chosen", async () => {
    const user = userEvent.setup();
    render(<SectionEditorDialog projectId="project-1" open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "startBlank" }));

    expect(screen.getByLabelText("nameLabel")).toHaveValue("");
    expect(screen.getByLabelText("instructionsLabel")).toHaveValue("");
  });

  it("refuses to submit without a name and a brief", async () => {
    const user = userEvent.setup();
    render(<SectionEditorDialog projectId="project-1" open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "startBlank" }));

    expect(screen.getByRole("button", { name: "create" })).toBeDisabled();
  });

  it("submits a new section with its four editorial dimensions", async () => {
    const user = userEvent.setup();
    render(<SectionEditorDialog projectId="project-1" open onOpenChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /suggestion_overview_name/ }));
    await user.click(screen.getByRole("button", { name: "create" }));

    expect(create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "suggestion_overview_name",
        instructions: "suggestion_overview_instructions",
        editorial: {
          length: "balanced",
          pedagogy: "guided",
          technicalFamiliarity: "novice",
          tone: "reassuring",
        },
      }),
      expect.anything(),
    );
  });

  describe("editing an existing section", () => {
    it("skips the suggestions and opens on its current values", () => {
      render(
        <SectionEditorDialog
          projectId="project-1"
          section={section}
          open
          onOpenChange={vi.fn()}
        />,
      );

      expect(
        screen.queryByRole("button", { name: /suggestion_overview_name/ }),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText("nameLabel")).toHaveValue(
        "Ce que le client a demandé",
      );
    });

    // FR-020: revising a section marks it for refresh rather than recomposing,
    // and the contributor is told so before they save.
    it("says that saving marks the section rather than rewriting it", () => {
      render(
        <SectionEditorDialog
          projectId="project-1"
          section={section}
          open
          onOpenChange={vi.fn()}
        />,
      );

      expect(screen.getByText("refreshNotice")).toBeVisible();
    });

    it("carries the version it was opened at, so a concurrent edit is refused", async () => {
      const user = userEvent.setup();
      render(
        <SectionEditorDialog
          projectId="project-1"
          section={section}
          open
          onOpenChange={vi.fn()}
        />,
      );

      await user.click(screen.getByRole("button", { name: "save" }));

      expect(update.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ expectedVersion: 3 }),
        expect.anything(),
      );
    });
  });
});
