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
        ],
        total: 2,
        nextCursor: null,
      },
      isPending: false,
      isError: false,
    } as never);
  });

  it("puts recovery actions beside documents that need them", () => {
    render(<DocumentManagementPage projectId="project-1" />);

    expect(screen.getByRole("heading", { name: "title" })).toBeVisible();
    expect(screen.getByText("statusFailed")).toBeVisible();
    expect(screen.getByText("statusRemoving")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "retryProcessing" }));
    expect(retryProcessing).toHaveBeenCalledWith("failed");
    fireEvent.click(screen.getByRole("button", { name: "resumeRemoval" }));
    expect(retryRemoval).toHaveBeenCalledWith("pending");
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
