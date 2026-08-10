import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Resource } from "schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDeleteResource } from "../hooks";
import { ResourceDetailPageContent } from "./resource-detail-page-content";

const mockPush = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("../hooks", () => ({
  useDeleteResource: vi.fn(),
}));

const mockedUseDeleteResource = vi.mocked(useDeleteResource);

function deleteMutation() {
  return {
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<typeof useDeleteResource>;
}

const baseResource: Resource = {
  id: "resource-1",
  projectId: "project-1",
  source: "upload",
  status: "pending",
  title: "Architecture overview",
  originalFileUrl: null,
  originalFileName: "a.pdf",
  originalFileMimeType: "application/pdf",
  notionPageUrl: null,
  failureReason: null,
  createdAt: "2026-08-08T00:00:00.000Z",
};

describe("ResourceDetailPageContent", () => {
  beforeEach(() => {
    mockedUseDeleteResource.mockReturnValue(deleteMutation());
    mockPush.mockReset();
  });

  it("shows a processing state while the document is still pending", () => {
    render(<ResourceDetailPageContent projectId="project-1" resource={baseResource} />);

    expect(screen.getByText("processing")).toBeInTheDocument();
  });

  it("falls back to a generic message when a failed document recorded no reason", () => {
    render(
      <ResourceDetailPageContent
        projectId="project-1"
        resource={{ ...baseResource, status: "failed", failureReason: null }}
      />,
    );

    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  // A failed document is where the contributor learns what went wrong — the
  // recorded reason is far more actionable than a generic message.
  it("surfaces the recorded failure reason on a failed document", () => {
    render(
      <ResourceDetailPageContent
        projectId="project-1"
        resource={{
          ...baseResource,
          status: "failed",
          failureReason: "invalid_request_error: image dimensions exceed 8000 pixels",
        }}
      />,
    );

    expect(
      screen.getByText("invalid_request_error: image dimensions exceed 8000 pixels"),
    ).toBeInTheDocument();
  });

  describe("contributor actions", () => {
    // specs/015 Q3: per-document publication is gone. A document is an input;
    // what gets published is the category content, and that decision is taken
    // in the draft queue. Delete is the only action left here.
    it("offers Delete and no publish action, in every state", () => {
      const { rerender } = render(
        <ResourceDetailPageContent projectId="project-1" resource={baseResource} />,
      );
      expect(screen.getByRole("button", { name: "delete" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "publish" })).not.toBeInTheDocument();

      rerender(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={{ ...baseResource, status: "absorbed" }}
        />,
      );
      expect(screen.getByRole("button", { name: "delete" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "publish" })).not.toBeInTheDocument();
    });

    it("deletes the document and navigates back to the project on success", async () => {
      const del = deleteMutation();
      (del.mutate as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        (_id: string, options: { onSuccess: () => void }) => options.onSuccess(),
      );
      mockedUseDeleteResource.mockReturnValue(del);
      const user = userEvent.setup();

      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={{ ...baseResource, status: "absorbed" }}
        />,
      );
      await user.click(screen.getByRole("button", { name: "delete" }));

      expect(del.mutate).toHaveBeenCalledWith(
        "resource-1",
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
      expect(mockPush).toHaveBeenCalledWith("/projects/project-1");
    });
  });

  // The reason this route survived the 015 demolition at all: the original
  // document has nowhere else to live, and folding a preview into the list
  // would make the list heavier rather than lighter.
  describe("original document (preview/download/Notion link)", () => {
    it("renders the document title alongside the original", () => {
      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={{ ...baseResource, status: "absorbed" }}
        />,
      );

      expect(screen.getByRole("heading", { name: "Architecture overview" })).toBeInTheDocument();
    });

    it("renders a PDF preview and a download link for an upload-sourced PDF", () => {
      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={{
            ...baseResource,
            status: "absorbed",
            originalFileUrl: "https://r2.example.com/a.pdf?sig=abc",
            originalFileMimeType: "application/pdf",
          }}
        />,
      );

      const iframe = screen.getByTitle("a.pdf");
      expect(iframe.tagName).toBe("IFRAME");
      expect(iframe).toHaveAttribute("src", "https://r2.example.com/a.pdf?sig=abc");
      expect(screen.getByRole("link", { name: "downloadOriginal" })).toHaveAttribute(
        "href",
        "https://r2.example.com/a.pdf?sig=abc",
      );
    });

    it("renders an image preview for an upload-sourced image", () => {
      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={{
            ...baseResource,
            status: "absorbed",
            originalFileName: "diagram.png",
            originalFileUrl: "https://r2.example.com/diagram.png?sig=abc",
            originalFileMimeType: "image/png",
          }}
        />,
      );

      expect(screen.getByRole("img", { name: "diagram.png" })).toHaveAttribute(
        "src",
        "https://r2.example.com/diagram.png?sig=abc",
      );
    });

    it("offers only a download link, no preview, for a non-previewable format like .docx", () => {
      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={{
            ...baseResource,
            status: "absorbed",
            originalFileName: "spec.docx",
            originalFileUrl: "https://r2.example.com/spec.docx?sig=abc",
            originalFileMimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          }}
        />,
      );

      expect(screen.queryByRole("img")).not.toBeInTheDocument();
      expect(screen.queryByTitle("spec.docx")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "downloadOriginal" })).toHaveAttribute(
        "href",
        "https://r2.example.com/spec.docx?sig=abc",
      );
    });

    it("shows a link back to the Notion page for a notion-sourced document", () => {
      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={{
            ...baseResource,
            status: "absorbed",
            source: "notion",
            originalFileUrl: null,
            originalFileName: null,
            originalFileMimeType: null,
            notionPageUrl: "https://notion.so/some-page",
          }}
        />,
      );

      expect(screen.getByRole("link", { name: "viewOnNotion" })).toHaveAttribute(
        "href",
        "https://notion.so/some-page",
      );
      expect(screen.queryByRole("link", { name: "downloadOriginal" })).not.toBeInTheDocument();
    });
  });
});
