import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentationDocuments } from "../hooks";
import { useProject } from "@/features/projects/hooks";
import { DocumentManagementPage } from "./document-management-page";

vi.mock("../hooks", () => ({ useDocumentationDocuments: vi.fn() }));
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

describe("DocumentManagementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useProject).mockReturnValue({
      data: { role: "contributor" },
      isPending: false,
      isError: false,
    } as never);
    vi.mocked(useDocumentationDocuments).mockReturnValue({
      data: {
        items: [
          { id: "failed", title: "Cadrage", status: "failed", kind: "notion" },
          {
            id: "in",
            title: "Architecture",
            status: "incorporated",
            kind: "upload",
          },
        ],
        total: 2,
        nextCursor: null,
      },
      isPending: false,
      isError: false,
    } as never);
  });

  it("lists the documents the project holds, with their state", () => {
    render(<DocumentManagementPage projectId="project-1" />);

    // The page is the inventory: its h1 names the list.
    expect(
      screen.getByRole("heading", { name: "documentsTitle" }),
    ).toBeVisible();
    expect(screen.getByText("statusFailed")).toBeVisible();
    expect(screen.getByText("statusIncorporated")).toBeVisible();
  });

  // A document is read once at upload and then it is in. There is nothing to
  // stop, nothing to retry and no removal to resume — offering any of it would
  // promise a pipeline that no longer exists.
  it("offers only removal, on every row", () => {
    render(<DocumentManagementPage projectId="project-1" />);

    expect(screen.getAllByRole("button", { name: "remove" })).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "retryProcessing" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "cancelProcessing" }),
    ).not.toBeInTheDocument();
  });

  it("opens addition and confirmed deletion from the same page", () => {
    render(<DocumentManagementPage projectId="project-1" />);

    fireEvent.click(screen.getByRole("button", { name: "add" }));
    expect(screen.getByText("add-document-dialog")).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "remove" })[0]);
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
