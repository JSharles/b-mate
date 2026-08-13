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
        title: "Cahier des charges",
        remainingDocumentCount: 1,
        referenceNeedsRewrite: true,
      },
    } as never);
    mutate.mockImplementation((_input, options) => options.onSuccess());
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

  // FR-006: the reference document already written stays readable — it is what
  // the client-facing sections were composed against. It is simply owed a
  // rewrite that no longer draws on this document.
  it("says the reference document will be owed a rewrite", () => {
    vi.mocked(useDocumentRemovalPreview).mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        documentId: "document-1",
        documentVersion: 1,
        title: "Cahier des charges",
        remainingDocumentCount: 2,
        referenceNeedsRewrite: true,
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

    expect(screen.getByText("impact")).toBeVisible();
    expect(screen.getByText("needsRewrite")).toBeVisible();
  });

  it("says nothing about a rewrite on a project that never wrote one", () => {
    vi.mocked(useDocumentRemovalPreview).mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        documentId: "document-1",
        documentVersion: 1,
        title: "Cahier des charges",
        remainingDocumentCount: 0,
        referenceNeedsRewrite: false,
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

    expect(screen.queryByText("needsRewrite")).not.toBeInTheDocument();
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

  it("tells the page the document is gone once it is", () => {
    const onRemoved = vi.fn();
    vi.mocked(useDocumentRemovalPreview).mockReturnValue({
      isPending: false,
      isError: false,
      data: {
        documentId: "document-1",
        documentVersion: 1,
        title: "Cahier des charges",
        remainingDocumentCount: 0,
        referenceNeedsRewrite: false,
      },
    } as never);
    mutate.mockImplementation((_input, options) => options.onSuccess());

    render(
      <RemoveDocumentDialog
        projectId="project-1"
        documentId="document-1"
        open
        onOpenChange={vi.fn()}
        onRemoved={onRemoved}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "confirm" }));

    expect(onRemoved).toHaveBeenCalled();
  });
});
