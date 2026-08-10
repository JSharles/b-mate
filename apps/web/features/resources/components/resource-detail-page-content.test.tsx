import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDeleteResource, usePublishResource } from "../hooks";
import { ResourceDetailPageContent } from "./resource-detail-page-content";

const mockPush = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("../hooks", () => ({
  usePublishResource: vi.fn(),
  useDeleteResource: vi.fn(),
}));

// The section review surface has its own spec (section-review-list.test.tsx);
// stubbing it here keeps this file about the page shell — states, actions and
// the original-document access.
vi.mock("./section-review-list", () => ({
  SectionReviewList: () => <div data-testid="section-review-list" />,
}));

const mockedUsePublishResource = vi.mocked(usePublishResource);
const mockedUseDeleteResource = vi.mocked(useDeleteResource);

function baseMutation<T extends (...args: never[]) => { mutate: unknown }>() {
  return {
    mutate: vi.fn(),
    isPending: false,
  } as unknown as ReturnType<T>;
}

const baseResource = {
  id: "resource-1",
  projectId: "project-1",
  source: "upload" as const,
  status: "processing" as const,
  title: "Architecture overview",
  originalFileUrl: null,
  originalFileName: "a.pdf",
  originalFileMimeType: "application/pdf",
  notionPageUrl: null,
  failureReason: null,
  publishedAt: null,
  createdAt: "2026-08-08T00:00:00.000Z",
  sections: [
    {
      id: "section-1",
      categoryKey: "overview" as const,
      status: "approved" as const,
      title: "What this delivers",
      content: "The overview slice.",
    },
  ],
};

describe("ResourceDetailPageContent", () => {
  beforeEach(() => {
    mockedUsePublishResource.mockReturnValue(baseMutation<typeof usePublishResource>());
    mockedUseDeleteResource.mockReturnValue(baseMutation<typeof useDeleteResource>());
    mockPush.mockReset();
  });

  it("shows a processing state when the resource isn't done yet", () => {
    render(
      <ResourceDetailPageContent projectId="project-1" resource={baseResource} />,
    );

    expect(screen.getByText("processing")).toBeInTheDocument();
  });

  it("falls back to a generic message when a failed resource recorded no reason", () => {
    render(
      <ResourceDetailPageContent
        projectId="project-1"
        resource={{ ...baseResource, status: "failed", failureReason: null }}
      />,
    );

    expect(screen.getByText("failed")).toBeInTheDocument();
  });



  describe("developer actions", () => {
    it("shows Publish and Delete when ready for review", () => {
      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={{ ...baseResource, status: "ready_for_review" }}
        />,
      );

      expect(screen.getByRole("button", { name: "publish" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "delete" })).toBeInTheDocument();
    });

    it("shows only Delete when published (no Publish button)", () => {
      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={{ ...baseResource, status: "published" }}
        />,
      );

      expect(screen.queryByRole("button", { name: "publish" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "delete" })).toBeInTheDocument();
    });

    it("shows only Delete when processing or failed (no Publish button)", () => {
      render(
        <ResourceDetailPageContent projectId="project-1" resource={baseResource} />,
      );

      expect(screen.queryByRole("button", { name: "publish" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "delete" })).toBeInTheDocument();
    });


    it("calls the publish mutation when Publish is clicked", async () => {
      const publish = baseMutation<typeof usePublishResource>();
      mockedUsePublishResource.mockReturnValue(publish);
      const user = userEvent.setup();

      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={{ ...baseResource, status: "ready_for_review" }}
        />,
      );
      await user.click(screen.getByRole("button", { name: "publish" }));

      expect(publish.mutate).toHaveBeenCalledWith("resource-1");
    });

    it("calls the delete mutation and navigates back to the project on success", async () => {
      const del = baseMutation<typeof useDeleteResource>();
      (del.mutate as ReturnType<typeof vi.fn>).mockImplementation(
        (_id: string, options: { onSuccess: () => void }) => options.onSuccess(),
      );
      mockedUseDeleteResource.mockReturnValue(del);
      const user = userEvent.setup();

      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={{ ...baseResource, status: "ready_for_review" }}
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

  describe("original document (preview/download/Notion link)", () => {
    it("renders a PDF preview and a download link for an upload-sourced PDF", () => {
      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={{
            ...baseResource,
            status: "published",
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
            status: "published",
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
            status: "published",
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

    it("shows a link back to the Notion page for a notion-sourced resource, no preview/download", () => {
      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={{
            ...baseResource,
            status: "published",
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

  describe("section review", () => {
    it("renders the resource title and hands content to the section review list", () => {
      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={{ ...baseResource, status: "ready_for_review" }}
        />,
      );

      expect(
        screen.getByRole("heading", { name: "Architecture overview" }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("section-review-list")).toBeInTheDocument();
    });

    // research.md Decision 4: publishing with nothing approved yields a
    // resource that is published yet contributes to no tab. The API refuses
    // it; disabling the button explains why before the click.
    it("disables Publish and explains why when no section is approved", () => {
      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={{
            ...baseResource,
            status: "ready_for_review",
            sections: [
              {
                id: "section-1",
                categoryKey: "overview",
                status: "proposed",
                title: "What this delivers",
                content: "The overview slice.",
              },
            ],
          }}
        />,
      );

      expect(screen.getByRole("button", { name: "publish" })).toBeDisabled();
      expect(screen.getByText("publishBlocked")).toBeInTheDocument();
    });

    it("enables Publish as soon as one section is approved", () => {
      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={{ ...baseResource, status: "ready_for_review" }}
        />,
      );

      expect(screen.getByRole("button", { name: "publish" })).toBeEnabled();
      expect(screen.queryByText("publishBlocked")).not.toBeInTheDocument();
    });

    // A failed resource is where the contributor learns what went wrong — the
    // recorded reason is far more actionable than a generic message.
    it("surfaces the recorded failure reason on a failed resource", () => {
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
  });
});
