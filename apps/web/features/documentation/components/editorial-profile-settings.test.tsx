import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api-client";
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

  // The editorial mutations suppress the global toast, so without a rendered
  // error a rejected confirm was indistinguishable from a dead button.
  describe("when a write is rejected", () => {
    it("names a version conflict on the proposal actions", () => {
      vi.mocked(useEditorialProfile).mockReturnValue({
        data: {
          ...baseProfile,
          proposal: { id: "proposal-1", version: 4, status: "preview_ready" },
        },
      } as never);
      vi.mocked(useConfirmEditorialProfile).mockReturnValue({
        mutate: confirm,
        error: new ApiError("conflict", 409),
      } as never);

      render(<EditorialProfileSettings projectId="project-1" />);

      expect(screen.getByRole("alert")).toHaveTextContent("staleError");
    });

    it("surfaces a rejected preview request", () => {
      vi.mocked(useEditorialProfile).mockReturnValue({ data: baseProfile } as never);
      vi.mocked(useProposeEditorialProfile).mockReturnValue({
        mutate: propose,
        isPending: false,
        error: new ApiError("boom", 500),
      } as never);

      render(<EditorialProfileSettings projectId="project-1" />);

      expect(screen.getByRole("alert")).toHaveTextContent("error");
    });

    it("locks confirm and cancel while one is in flight", () => {
      vi.mocked(useEditorialProfile).mockReturnValue({
        data: {
          ...baseProfile,
          proposal: { id: "proposal-1", version: 4, status: "preview_ready" },
        },
      } as never);
      vi.mocked(useConfirmEditorialProfile).mockReturnValue({
        mutate: confirm,
        isPending: true,
      } as never);

      render(<EditorialProfileSettings projectId="project-1" />);

      expect(screen.getByRole("button", { name: "confirm" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "cancel" })).toBeDisabled();
    });
  });
});
