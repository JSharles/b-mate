import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCancelEditorialProfile,
  useConfirmEditorialProfile,
  useEditorialProfile,
  useProposeEditorialProfile,
} from "../hooks";
import { EditorialProfileSettings } from "./editorial-profile-settings";

vi.mock("../hooks", () => ({
  useCancelEditorialProfile: vi.fn(),
  useConfirmEditorialProfile: vi.fn(),
  useEditorialProfile: vi.fn(),
  useProposeEditorialProfile: vi.fn(),
}));

const propose = vi.fn();
const confirm = vi.fn();
const cancel = vi.fn();
const baseProfile = {
  revisionId: null,
  sequence: 0,
  version: 2,
  length: "balanced",
  pedagogy: "guided",
  technicalFamiliarity: "novice",
  tone: "reassuring",
  guidance: null,
  proposal: null,
};

describe("EditorialProfileSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useProposeEditorialProfile).mockReturnValue({ mutate: propose, isPending: false } as never);
    vi.mocked(useConfirmEditorialProfile).mockReturnValue({ mutate: confirm } as never);
    vi.mocked(useCancelEditorialProfile).mockReturnValue({ mutate: cancel } as never);
  });

  it("waits for the profile query", () => {
    vi.mocked(useEditorialProfile).mockReturnValue({ data: undefined } as never);
    const { container } = render(<EditorialProfileSettings projectId="project-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("previews an editable profile without publishing it", () => {
    vi.mocked(useEditorialProfile).mockReturnValue({ data: baseProfile } as never);
    render(<EditorialProfileSettings projectId="project-1" />);

    fireEvent.change(screen.getByLabelText("length"), { target: { value: "concise" } });
    fireEvent.change(screen.getByLabelText("guidance"), {
      target: { value: "Prefer concrete examples." },
    });
    fireEvent.click(screen.getByRole("button", { name: "preview" }));

    expect(propose).toHaveBeenCalledWith({
      expectedVersion: 2,
      values: expect.objectContaining({
        length: "concise",
        guidance: "Prefer concrete examples.",
      }),
    });
  });

  it.each([
    ["preview_pending", "generating", true],
    ["saved_without_preview", "noContent", false],
    ["preview_ready", "previewTitle", false],
  ] as const)("renders proposal status %s", (status, label, confirmDisabled) => {
    vi.mocked(useEditorialProfile).mockReturnValue({
      data: {
        ...baseProfile,
        proposal: {
          id: "proposal-1",
          status,
          version: 4,
          before: status === "preview_ready" ? { categoryKey: "overview", blocks: [{ type: "paragraph", text: "Before" }] } : null,
          after: status === "preview_ready" ? { categoryKey: "overview", blocks: [{ type: "paragraph", text: "After" }] } : null,
        },
      },
    } as never);
    render(<EditorialProfileSettings projectId="project-1" />);

    expect(screen.getByText(label)).toBeVisible();
    const confirmButton = screen.getByRole("button", { name: "confirm" });
    expect(confirmButton).toHaveProperty("disabled", confirmDisabled);
    if (!confirmDisabled) fireEvent.click(confirmButton);
    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    if (!confirmDisabled) {
      expect(confirm).toHaveBeenCalledWith({ proposalId: "proposal-1", expectedVersion: 4 });
    }
    expect(cancel).toHaveBeenCalledWith({ proposalId: "proposal-1", expectedVersion: 4 });
  });
});
