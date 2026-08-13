import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentationDocuments, useReferenceSummary } from "../hooks";
import { useProject } from "@/features/projects/hooks";
import { DocumentaryBasePage } from "./documentary-base-page";

vi.mock("../hooks", () => ({
  useDocumentationDocuments: vi.fn(),
  useReferenceSummary: vi.fn(),
}));
vi.mock("@/features/projects/hooks", () => ({ useProject: vi.fn() }));
vi.mock("./reference-document-view", () => ({
  ReferenceDocumentView: () => <div>reference-document</div>,
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
  Link: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ replace }),
}));

function withSummary(data: Record<string, unknown>) {
  vi.mocked(useReferenceSummary).mockReturnValue({
    data,
    isPending: false,
    isError: false,
  } as never);
}

describe("DocumentaryBasePage", () => {
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
          { id: "d1", title: "Cahier des charges", status: "incorporated" },
        ],
        total: 1,
      },
      isPending: false,
      isError: false,
    } as never);
    withSummary({ documentCount: 1, document: { status: "ready" } });
  });

  // The documents and the document written from them are one job: a document is
  // added so that the reference changes, and adding one starts the write.
  it("puts the documents and the document written from them on one screen", () => {
    render(<DocumentaryBasePage projectId="project-1" />);

    expect(screen.getByRole("heading", { name: "title" })).toBeVisible();
    expect(screen.getByText("Cahier des charges")).toBeVisible();
    expect(screen.getByText("reference-document")).toBeVisible();
  });

  it("opens addition and removal from the same page", () => {
    render(<DocumentaryBasePage projectId="project-1" />);

    fireEvent.click(screen.getByRole("button", { name: "add" }));
    expect(screen.getByText("add-document-dialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "remove" }));
    expect(screen.getByText("remove-document-dialog")).toBeVisible();
  });

  it("invites a first document when the base is empty", () => {
    vi.mocked(useDocumentationDocuments).mockReturnValue({
      data: { items: [], total: 0 },
      isPending: false,
      isError: false,
    } as never);
    withSummary({ documentCount: 0, document: null });

    render(<DocumentaryBasePage projectId="project-1" />);

    expect(screen.getByText("emptyTitle")).toBeVisible();
  });

  // Finishing the reference is exactly when the developer is ready for the next
  // job, so the way there is offered here rather than only from the project.
  it("points at the client content once the document is written", () => {
    render(<DocumentaryBasePage projectId="project-1" />);

    expect(
      screen.getByRole("link", { name: /toClientContent/ }),
    ).toHaveAttribute("href", "/projects/project-1/client");
  });

  it("does not point there while nothing has been written", () => {
    withSummary({ documentCount: 1, document: null });

    render(<DocumentaryBasePage projectId="project-1" />);

    expect(
      screen.queryByRole("link", { name: /toClientContent/ }),
    ).not.toBeInTheDocument();
  });

  // A failed request is not an empty base.
  it("says the documents failed to load rather than showing none", () => {
    vi.mocked(useDocumentationDocuments).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as never);

    render(<DocumentaryBasePage projectId="project-1" />);

    expect(screen.getByRole("alert")).toHaveTextContent("documentsLoadError");
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });

  it("redirects a client without exposing contributor documents", () => {
    vi.mocked(useProject).mockReturnValue({
      data: { role: "client" },
      isPending: false,
      isError: false,
    } as never);

    render(<DocumentaryBasePage projectId="project-1" />);

    expect(replace).toHaveBeenCalledWith("/projects/project-1");
    expect(screen.queryByText("Cahier des charges")).not.toBeInTheDocument();
  });
});
