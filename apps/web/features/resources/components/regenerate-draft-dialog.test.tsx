import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReferenceDraft } from "schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDiscardDraft, useRegenerateDraft } from "../hooks";
import { RegenerateDraftDialog } from "./regenerate-draft-dialog";

vi.mock("../hooks", () => ({
  useRegenerateDraft: vi.fn(),
  useDiscardDraft: vi.fn(),
}));

const mockedUseRegenerateDraft = vi.mocked(useRegenerateDraft);
const mockedUseDiscardDraft = vi.mocked(useDiscardDraft);

// Both mutations are stubbed through the same shape; the cast is per call
// site because their variables differ (an instruction, or nothing).
function mutation<T>() {
  return { mutate: vi.fn(), isPending: false } as unknown as T;
}

function fakeDraft(overrides: Partial<ReferenceDraft> = {}): ReferenceDraft {
  return {
    categoryKey: "planning",
    status: "pending_review",
    content: "Delivery is planned for February.",
    trigger: "document_added",
    triggerDocumentTitle: "Roadmap",
    attempt: 1,
    questions: [],
    createdAt: "2026-08-08T00:00:00.000Z",
    ...overrides,
  };
}

describe("RegenerateDraftDialog", () => {
  beforeEach(() => {
    mockedUseRegenerateDraft.mockReturnValue(
      mutation<ReturnType<typeof useRegenerateDraft>>(),
    );
    mockedUseDiscardDraft.mockReturnValue(
      mutation<ReturnType<typeof useDiscardDraft>>(),
    );
  });

  it("stays closed when no draft is being refused", () => {
    render(
      <RegenerateDraftDialog projectId="project-1" draft={null} onOpenChange={vi.fn()} />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // FR-015: refusing is not a dead end. Either the draft goes away and the
  // previously validated version stays live, or it comes back corrected.
  it("offers both ways out of a refusal", () => {
    render(
      <RegenerateDraftDialog
        projectId="project-1"
        draft={fakeDraft()}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "regenerate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "discard" })).toBeInTheDocument();
  });

  // The contributor directs; they never rewrite the text themselves — so an
  // empty instruction has nothing to act on.
  it("refuses to regenerate on an empty instruction", async () => {
    const regenerate = mutation<ReturnType<typeof useRegenerateDraft>>();
    mockedUseRegenerateDraft.mockReturnValue(regenerate);
    const user = userEvent.setup();

    render(
      <RegenerateDraftDialog
        projectId="project-1"
        draft={fakeDraft()}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "regenerate" })).toBeDisabled();

    await user.type(screen.getByLabelText("instructionLabel"), "   ");
    expect(screen.getByRole("button", { name: "regenerate" })).toBeDisabled();
    expect(regenerate.mutate).not.toHaveBeenCalled();
  });

  it("sends the contributor's instruction with the refused category, then closes", async () => {
    const regenerate = mutation<ReturnType<typeof useRegenerateDraft>>();
    (regenerate.mutate as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_vars: unknown, options: { onSuccess: () => void }) => options.onSuccess(),
    );
    mockedUseRegenerateDraft.mockReturnValue(regenerate);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <RegenerateDraftDialog
        projectId="project-1"
        draft={fakeDraft()}
        onOpenChange={onOpenChange}
      />,
    );

    await user.type(
      screen.getByLabelText("instructionLabel"),
      "The migration is March, not February.",
    );
    await user.click(screen.getByRole("button", { name: "regenerate" }));

    expect(regenerate.mutate).toHaveBeenCalledWith(
      { categoryKey: "planning", instruction: "The migration is March, not February." },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("discards the draft without asking for an instruction", async () => {
    const discard = mutation<ReturnType<typeof useDiscardDraft>>();
    (discard.mutate as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_vars: unknown, options: { onSuccess: () => void }) => options.onSuccess(),
    );
    mockedUseDiscardDraft.mockReturnValue(discard);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <RegenerateDraftDialog
        projectId="project-1"
        draft={fakeDraft()}
        onOpenChange={onOpenChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "discard" }));

    expect(discard.mutate).toHaveBeenCalledWith(
      { categoryKey: "planning" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // research.md Decision 4: past three attempts the loop is not converging.
  // Saying so before the click beats a 409 after it — but discarding must stay
  // available, or the contributor is stuck with a draft they refused.
  it("withdraws the instruction path at the attempt cap, keeping discard available", () => {
    render(
      <RegenerateDraftDialog
        projectId="project-1"
        draft={fakeDraft({ attempt: 3 })}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText("capReached")).toBeInTheDocument();
    expect(screen.queryByLabelText("instructionLabel")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "regenerate" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "discard" })).toBeInTheDocument();
  });

  // Reopening on another category must not inherit the abandoned instruction.
  it("clears the instruction when the dialog closes", async () => {
    const discard = mutation<ReturnType<typeof useDiscardDraft>>();
    (discard.mutate as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_vars: unknown, options: { onSuccess: () => void }) => options.onSuccess(),
    );
    mockedUseDiscardDraft.mockReturnValue(discard);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <RegenerateDraftDialog
        projectId="project-1"
        draft={fakeDraft()}
        onOpenChange={onOpenChange}
      />,
    );

    await user.type(screen.getByLabelText("instructionLabel"), "Abandoned text.");
    await user.click(screen.getByRole("button", { name: "discard" }));

    rerender(
      <RegenerateDraftDialog
        projectId="project-1"
        draft={fakeDraft({ categoryKey: "overview" })}
        onOpenChange={onOpenChange}
      />,
    );

    expect(screen.getByLabelText("instructionLabel")).toHaveValue("");
  });
});
