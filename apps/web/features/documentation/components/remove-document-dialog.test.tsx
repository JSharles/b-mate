import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useConfirmDocumentRemoval, useDocumentRemovalPreview } from "../hooks";
import { RemoveDocumentDialog } from "./remove-document-dialog";

vi.mock("../hooks", () => ({
  useConfirmDocumentRemoval: vi.fn(),
  useDocumentRemovalPreview: vi.fn(),
}));

describe("RemoveDocumentDialog", () => {
  const mutate = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useConfirmDocumentRemoval).mockReturnValue({
      mutate,
      reset: vi.fn(),
      isPending: false,
      isError: false,
    } as never);
  });

  it("blocks confirmation until the impact preview is ready", () => {
    vi.mocked(useDocumentRemovalPreview).mockReturnValue({
      data: undefined,
      isError: false,
    } as never);
    render(
      <RemoveDocumentDialog
        projectId="project-1"
        documentId="document-1"
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "confirm" })).toBeDisabled();
  });

  it("confirms the exact preview and closes only after success", () => {
    const onOpenChange = vi.fn();
    vi.mocked(useDocumentRemovalPreview).mockReturnValue({
      isError: false,
      data: {
        documentId: "document-1",
        documentVersion: 3,
        sourceRevisionId: "00000000-0000-4000-8000-000000000001",
        observationCount: 2,
        supportedItemCount: 2,
        soleSupportItemCount: 1,
        confirmationToken: "a".repeat(64),
      },
    } as never);
    mutate.mockImplementation((_input, options) =>
      options.onSuccess({ status: "completed" }),
    );
    render(
      <RemoveDocumentDialog
        projectId="project-1"
        documentId="document-1"
        open
        onOpenChange={onOpenChange}
      />,
    );
    expect(screen.getByText("impact")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "confirm" }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "document-1",
        data: expect.objectContaining({
          confirmed: true,
          expectedDocumentVersion: 3,
        }),
      }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("explains a failed document can be deleted without rebuilding the source", () => {
    vi.mocked(useDocumentRemovalPreview).mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        documentId: "document-1",
        documentVersion: 1,
        sourceRevisionId: null,
        observationCount: 0,
        supportedItemCount: 0,
        soleSupportItemCount: 0,
        confirmationToken: "a".repeat(64),
      },
    } as never);
    render(
      <RemoveDocumentDialog
        projectId="project-1"
        documentId="document-1"
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText("notIncorporatedImpact")).toBeVisible();
  });

  it("shows a recoverable error", () => {
    const refetch = vi.fn();
    vi.mocked(useDocumentRemovalPreview).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    } as never);
    render(
      <RemoveDocumentDialog
        projectId="project-1"
        documentId="document-1"
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("error");
    fireEvent.click(screen.getByRole("button", { name: "retryPreview" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("shows that impact is being checked before enabling deletion", () => {
    vi.mocked(useDocumentRemovalPreview).mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
    } as never);
    render(
      <RemoveDocumentDialog
        projectId="project-1"
        documentId="document-1"
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText("loadingImpact")).toBeVisible();
    expect(screen.getByRole("button", { name: "confirm" })).toBeDisabled();
  });

  it("does not report removal while storage still needs attention", () => {
    const onOpenChange = vi.fn();
    const onRemoved = vi.fn();
    vi.mocked(useDocumentRemovalPreview).mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        documentId: "document-1",
        documentVersion: 1,
        sourceRevisionId: null,
        observationCount: 0,
        supportedItemCount: 0,
        soleSupportItemCount: 0,
        confirmationToken: "a".repeat(64),
      },
    } as never);
    mutate.mockImplementation((_input, options) =>
      options.onSuccess({ status: "needs_attention" }),
    );
    render(
      <RemoveDocumentDialog
        projectId="project-1"
        documentId="document-1"
        open
        onOpenChange={onOpenChange}
        onRemoved={onRemoved}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "confirm" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onRemoved).not.toHaveBeenCalled();
  });
});
