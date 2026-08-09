import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useApproveResourceCategory,
  useDeleteResource,
  usePublishResource,
  useRejectResourceCategory,
} from "../hooks";
import { ResourceDetailPageContent } from "./resource-detail-page-content";

const mockPush = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("../hooks", () => ({
  usePublishResource: vi.fn(),
  useDeleteResource: vi.fn(),
  useApproveResourceCategory: vi.fn(),
  useRejectResourceCategory: vi.fn(),
}));

const mockedUsePublishResource = vi.mocked(usePublishResource);
const mockedUseDeleteResource = vi.mocked(useDeleteResource);
const mockedUseApproveResourceCategory = vi.mocked(useApproveResourceCategory);
const mockedUseRejectResourceCategory = vi.mocked(useRejectResourceCategory);

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
  vulgarizedTitle: null,
  vulgarizedContent: null,
  failureReason: null,
  publishedAt: null,
  createdAt: "2026-08-08T00:00:00.000Z",
  categories: [],
};

describe("ResourceDetailPageContent", () => {
  beforeEach(() => {
    mockedUsePublishResource.mockReturnValue(baseMutation<typeof usePublishResource>());
    mockedUseDeleteResource.mockReturnValue(baseMutation<typeof useDeleteResource>());
    mockedUseApproveResourceCategory.mockReturnValue(
      baseMutation<typeof useApproveResourceCategory>(),
    );
    mockedUseRejectResourceCategory.mockReturnValue(
      baseMutation<typeof useRejectResourceCategory>(),
    );
    mockPush.mockReset();
  });

  it("shows a processing state when the resource isn't done yet", () => {
    render(
      <ResourceDetailPageContent projectId="project-1" resource={baseResource} canManage={true} />,
    );

    expect(screen.getByText("processing")).toBeInTheDocument();
  });

  it("shows a failed state with no vulgarized content", () => {
    render(
      <ResourceDetailPageContent
        projectId="project-1"
        resource={{ ...baseResource, status: "failed", failureReason: "Extraction failed" }}
        canManage={true}
      />,
    );

    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("shows the vulgarized title and content once ready for review", () => {
    render(
      <ResourceDetailPageContent
        projectId="project-1"
        resource={{
          ...baseResource,
          status: "ready_for_review",
          vulgarizedTitle: "Plain-language title",
          vulgarizedContent: "Plain-language content.",
        }}
        canManage={true}
      />,
    );

    expect(screen.getByRole("heading", { name: "Plain-language title" })).toBeInTheDocument();
    expect(screen.getByText("Plain-language content.")).toBeInTheDocument();
  });

  it("shows the vulgarized content once published", () => {
    render(
      <ResourceDetailPageContent
        projectId="project-1"
        resource={{
          ...baseResource,
          status: "published",
          vulgarizedTitle: "Plain-language title",
          vulgarizedContent: "Plain-language content.",
          publishedAt: "2026-08-08T00:00:00.000Z",
        }}
        canManage={true}
      />,
    );

    expect(screen.getByRole("heading", { name: "Plain-language title" })).toBeInTheDocument();
  });

  describe("developer actions (canManage)", () => {
    it("shows Publish and Delete when ready for review", () => {
      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={{ ...baseResource, status: "ready_for_review" }}
          canManage={true}
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
          canManage={true}
        />,
      );

      expect(screen.queryByRole("button", { name: "publish" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "delete" })).toBeInTheDocument();
    });

    it("shows only Delete when processing or failed (no Publish button)", () => {
      render(
        <ResourceDetailPageContent projectId="project-1" resource={baseResource} canManage={true} />,
      );

      expect(screen.queryByRole("button", { name: "publish" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "delete" })).toBeInTheDocument();
    });

    it("shows no action buttons when canManage is false", () => {
      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={{ ...baseResource, status: "ready_for_review" }}
          canManage={false}
        />,
      );

      expect(screen.queryByRole("button", { name: "publish" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "delete" })).not.toBeInTheDocument();
    });

    it("calls the publish mutation when Publish is clicked", async () => {
      const publish = baseMutation<typeof usePublishResource>();
      mockedUsePublishResource.mockReturnValue(publish);
      const user = userEvent.setup();

      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={{ ...baseResource, status: "ready_for_review" }}
          canManage={true}
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
          canManage={true}
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
          canManage={false}
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
          canManage={false}
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
          canManage={false}
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
          canManage={false}
        />,
      );

      expect(screen.getByRole("link", { name: "viewOnNotion" })).toHaveAttribute(
        "href",
        "https://notion.so/some-page",
      );
      expect(screen.queryByRole("link", { name: "downloadOriginal" })).not.toBeInTheDocument();
    });
  });

  describe("category chips", () => {
    const categorizedResource = {
      ...baseResource,
      status: "ready_for_review" as const,
      categories: [
        {
          id: "assignment-1",
          categoryId: "category-1",
          key: "architecture-stack",
          label: "Architecture & stack",
          status: "proposed" as const,
        },
        {
          id: "assignment-2",
          categoryId: "category-2",
          key: "audit-findings",
          label: "Audit findings",
          status: "approved" as const,
        },
      ],
    };

    it("shows nothing when the resource has no categories", () => {
      const { container } = render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={{ ...baseResource, status: "ready_for_review" }}
          canManage={true}
        />,
      );

      expect(container.querySelector("ul")).not.toBeInTheDocument();
    });

    it("shows approve/reject controls for a proposed category when canManage, but not for an already-approved one", () => {
      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={categorizedResource}
          canManage={true}
        />,
      );

      expect(screen.getByText("Architecture & stack")).toBeInTheDocument();
      expect(screen.getByText("Audit findings")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "categoryApprove" })).toHaveLength(1);
      expect(screen.getAllByRole("button", { name: "categoryReject" })).toHaveLength(1);
      expect(screen.getByText("categoryApproved")).toBeInTheDocument();
    });

    it("hides approve/reject controls entirely for a client (canManage=false), even on a proposed category", () => {
      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={categorizedResource}
          canManage={false}
        />,
      );

      expect(screen.queryByRole("button", { name: "categoryApprove" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "categoryReject" })).not.toBeInTheDocument();
    });

    it("approves the proposed category assignment when Approve is clicked", async () => {
      const mutate = vi.fn();
      mockedUseApproveResourceCategory.mockReturnValue({
        mutate,
        isPending: false,
      } as unknown as ReturnType<typeof useApproveResourceCategory>);
      const user = userEvent.setup();

      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={categorizedResource}
          canManage={true}
        />,
      );
      await user.click(screen.getByRole("button", { name: "categoryApprove" }));

      expect(mutate).toHaveBeenCalledWith({
        resourceId: "resource-1",
        categoryAssignmentId: "assignment-1",
      });
    });

    it("rejects the proposed category assignment when Reject is clicked", async () => {
      const mutate = vi.fn();
      mockedUseRejectResourceCategory.mockReturnValue({
        mutate,
        isPending: false,
      } as unknown as ReturnType<typeof useRejectResourceCategory>);
      const user = userEvent.setup();

      render(
        <ResourceDetailPageContent
          projectId="project-1"
          resource={categorizedResource}
          canManage={true}
        />,
      );
      await user.click(screen.getByRole("button", { name: "categoryReject" }));

      expect(mutate).toHaveBeenCalledWith({
        resourceId: "resource-1",
        categoryAssignmentId: "assignment-1",
      });
    });
  });
});
