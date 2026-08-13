import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSourceDocument } from "@/features/documentation/hooks";
import { useProject } from "@/features/projects/hooks";
import SourceDocumentPage from "./page";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, use: (value: unknown) => value };
});
vi.mock("@/features/documentation/hooks", () => ({
  useSourceDocument: vi.fn(),
}));
vi.mock("@/features/documentation/components/remove-document-dialog", () => ({
  RemoveDocumentDialog: ({ open }: { open: boolean }) =>
    open ? <div>remove-dialog</div> : null,
}));
vi.mock("@/features/projects/hooks", () => ({ useProject: vi.fn() }));

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

const baseDocument = {
  id: "document-1",
  kind: "upload",
  status: "incorporated",
  version: 2,
  title: "Architecture détaillée.pdf",
  failureCode: null,
  originalDownloadUrl: "https://files.example/brief",
  originalFileName: "brief.pdf",
  externalUrl: null,
};

function renderPage() {
  return render(
    <SourceDocumentPage
      params={
        { id: "project-1", documentId: "document-1" } as unknown as Promise<{
          id: string;
          documentId: string;
        }>
      }
    />,
  );
}

describe("SourceDocumentPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useProject).mockReturnValue({
      data: { role: "contributor" },
      isPending: false,
      isError: false,
    } as never);
    vi.mocked(useSourceDocument).mockReturnValue({
      data: baseDocument,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
  });

  it("shows an incorporated uploaded document and its original", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: "Architecture détaillée.pdf" }),
    ).toBeVisible();
    expect(screen.getByText("uploadedDocument")).toBeVisible();
    expect(screen.getByText("statusIncorporated")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "downloadOriginal" }),
    ).toHaveAttribute("href", "https://files.example/brief");
  });

  it.each([
    ["failed", "statusFailed"],
    ["removed", "statusRemoved"],
  ] as const)("maps %s to the %s visible state", (status, label) => {
    vi.mocked(useSourceDocument).mockReturnValue({
      data: {
        ...baseDocument,
        status,
        originalDownloadUrl: null,
      },
      isPending: false,
      isError: false,
    } as never);
    renderPage();
    expect(screen.getByText(label)).toBeVisible();
  });

  it("renders a Notion document and a provider failure", () => {
    vi.mocked(useSourceDocument).mockReturnValue({
      data: {
        ...baseDocument,
        kind: "notion",
        status: "failed",
        failureCode: "DOCUMENT_UNREADABLE",
        originalDownloadUrl: null,
        externalUrl: "https://notion.so/page",
      },
      isPending: false,
      isError: false,
    } as never);
    renderPage();
    expect(screen.getByText("notionDocument")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("failureCode");
    expect(screen.getByRole("link", { name: "openOriginal" })).toHaveAttribute(
      "href",
      "https://notion.so/page",
    );
  });

  // A document is read once at upload and then it is in. The only thing left
  // to do with one is take it back out.
  it("offers removal, and no restart of a pipeline that no longer exists", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "removeDocument" }));

    expect(screen.getByText("remove-dialog")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "retryProcessing" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "cancelProcessing" }),
    ).not.toBeInTheDocument();
  });

  it("offers nothing to do with a document already removed", () => {
    vi.mocked(useSourceDocument).mockReturnValue({
      data: { ...baseDocument, status: "removed", originalDownloadUrl: null },
      isPending: false,
      isError: false,
    } as never);

    renderPage();

    expect(
      screen.queryByRole("button", { name: "removeDocument" }),
    ).not.toBeInTheDocument();
  });
});
