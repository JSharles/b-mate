import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useDocumentationDocuments,
  useRetryDocumentProcessing,
  useRetryDocumentRemoval,
} from "../hooks";
import { useProject } from "@/features/projects/hooks";
import { DocumentManagementPage } from "./document-management-page";

vi.mock("../hooks", () => ({
  useDocumentationDocuments: vi.fn(),
  useRetryDocumentProcessing: vi.fn(),
  useRetryDocumentRemoval: vi.fn(),
}));
vi.mock("@/features/projects/hooks", () => ({ useProject: vi.fn() }));
vi.mock("./documentation-workspace", () => ({
  DocumentationWorkspace: () => <div>documentation-workspace</div>,
}));
vi.mock("./add-document-dialog", () => ({
  AddDocumentDialog: ({ open }: { open: boolean }) =>
    open ? <div>add-document-dialog</div> : null,
}));
vi.mock("./remove-document-dialog", () => ({
  RemoveDocumentDialog: ({ open }: { open: boolean }) =>
    open ? <div>remove-document-dialog</div> : null,
}));

const replace = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
  useRouter: () => ({ replace }),
}));

const retryProcessing = vi.fn();
const retryRemoval = vi.fn();

describe("DocumentManagementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useProject).mockReturnValue({
      data: { role: "contributor" },
      isPending: false,
      isError: false,
    } as never);
    vi.mocked(useRetryDocumentProcessing).mockReturnValue({
      mutate: retryProcessing,
      isPending: false,
    } as never);
    vi.mocked(useRetryDocumentRemoval).mockReturnValue({
      mutate: retryRemoval,
      isPending: false,
    } as never);
    vi.mocked(useDocumentationDocuments).mockReturnValue({
      data: {
        items: [
          { id: "failed", title: "Cadrage", status: "failed", kind: "notion" },
          { id: "pending", title: "Architecture", status: "removal_pending", kind: "upload" },
          { id: "stuck", title: "Ancien brief", status: "removal_failed", kind: "upload" },
        ],
        total: 3,
        nextCursor: null,
      },
      isPending: false,
      isError: false,
    } as never);
  });

  it("puts recovery actions beside documents that need them", () => {
    render(<DocumentManagementPage projectId="project-1" />);

    // The page is the inventory now: its h1 names the list, and the pipeline
    // lives on its own route.
    expect(screen.getByRole("heading", { name: "documentsTitle" })).toBeVisible();
    expect(screen.getByText("statusFailed")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "retryProcessing" }));
    expect(retryProcessing).toHaveBeenCalledWith("failed");

    // Only a removal that genuinely failed is the contributor's to resume.
    fireEvent.click(screen.getByRole("button", { name: "resumeRemoval" }));
    expect(retryRemoval).toHaveBeenCalledWith("stuck");
  });

  // A removal still in flight is recovered by the server's stall sweep, so
  // offering "resume" beside its spinner made the row claim to be working and
  // stuck at the same time.
  it("offers no recovery beside a removal that is still running", () => {
    render(<DocumentManagementPage projectId="project-1" />);

    expect(screen.getByText("statusRemoving")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "resumeRemoval" })).toHaveLength(1);
  });

  it("opens addition and confirmed deletion from the same page", () => {
    render(<DocumentManagementPage projectId="project-1" />);

    fireEvent.click(screen.getByRole("button", { name: "add" }));
    expect(screen.getByText("add-document-dialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "remove" }));
    expect(screen.getByText("remove-document-dialog")).toBeVisible();
  });

  it("redirects a client without exposing contributor documents", () => {
    vi.mocked(useProject).mockReturnValue({
      data: { role: "client" },
      isPending: false,
      isError: false,
    } as never);

    render(<DocumentManagementPage projectId="project-1" />);

    expect(replace).toHaveBeenCalledWith("/projects/project-1");
    expect(screen.queryByText("Cadrage")).not.toBeInTheDocument();
  });
});
