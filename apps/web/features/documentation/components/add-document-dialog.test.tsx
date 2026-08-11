import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNotionConnectionStatus } from "@/shared/hooks/use-notion-connection-status";
import { useAddNotionDocument, useUploadDocument } from "../hooks";
import { AddDocumentDialog } from "./add-document-dialog";

vi.mock("../hooks", () => ({
  useUploadDocument: vi.fn(),
  useAddNotionDocument: vi.fn(),
}));

vi.mock("@/shared/hooks/use-notion-connection-status", () => ({
  useNotionConnectionStatus: vi.fn(),
}));

const mockedUpload = vi.mocked(useUploadDocument);
const mockedAddNotion = vi.mocked(useAddNotionDocument);
const mockedNotionStatus = vi.mocked(useNotionConnectionStatus);

function mutation() {
  return {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  };
}

describe("AddDocumentDialog", () => {
  beforeEach(() => {
    mockedUpload.mockReturnValue(mutation() as unknown as ReturnType<typeof useUploadDocument>);
    mockedAddNotion.mockReturnValue(
      mutation() as unknown as ReturnType<typeof useAddNotionDocument>,
    );
    mockedNotionStatus.mockReturnValue({
      data: { connected: true },
      isPending: false,
    } as ReturnType<typeof useNotionConnectionStatus>);
  });

  it("adds an uploaded document to the project source", async () => {
    const upload = mutation();
    mockedUpload.mockReturnValue(upload as unknown as ReturnType<typeof useUploadDocument>);
    const user = userEvent.setup();
    const file = new File(["project brief"], "brief.pdf", { type: "application/pdf" });

    render(
      <AddDocumentDialog projectId="project-1" open onOpenChange={vi.fn()} />,
    );
    await user.upload(screen.getByLabelText("fileLabel"), file);
    await user.click(screen.getByRole("button", { name: "uploadSubmit" }));

    expect(upload.mutate).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("adds an existing Notion page as another contribution to the same source", async () => {
    const addNotion = mutation();
    mockedAddNotion.mockReturnValue(
      addNotion as unknown as ReturnType<typeof useAddNotionDocument>,
    );
    const user = userEvent.setup();

    render(
      <AddDocumentDialog projectId="project-1" open onOpenChange={vi.fn()} />,
    );
    await user.click(screen.getByRole("tab", { name: "notionTab" }));
    await user.type(
      screen.getByLabelText("notionPageUrlLabel"),
      "https://notion.so/project-brief",
    );
    await user.click(screen.getByRole("button", { name: "notionSubmit" }));

    expect(addNotion.mutate).toHaveBeenCalledWith(
      { pageUrl: "https://notion.so/project-brief" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
