import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useCancelDocumentProcessing,
  useRetryDocumentProcessing,
  useRetryDocumentRemoval,
  useSourceDocument,
} from "@/features/documentation/hooks";
import { useProject } from "@/features/projects/hooks";
import SourceDocumentPage from "./page";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, use: (value: unknown) => value };
});
vi.mock("@/features/documentation/hooks", () => ({
  useSourceDocument: vi.fn(),
  useCancelDocumentProcessing: vi.fn(),
  useRetryDocumentProcessing: vi.fn(),
  useRetryDocumentRemoval: vi.fn(),
}));
vi.mock("@/features/documentation/components/remove-document-dialog", () => ({
  RemoveDocumentDialog: ({ open }: { open: boolean }) =>
    open ? <div>remove-dialog</div> : null,
}));
vi.mock("@/features/projects/hooks", () => ({ useProject: vi.fn() }));

const replace = vi.fn();
const cancelProcessing = vi.fn();
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
  affectedCategories: ["overview", "how_it_works"],
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
    vi.mocked(useRetryDocumentProcessing).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
    } as never);
    vi.mocked(useRetryDocumentRemoval).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      data: undefined,
    } as never);
    vi.mocked(useCancelDocumentProcessing).mockReturnValue({
      mutate: cancelProcessing,
      isPending: false,
      isError: false,
    } as never);
  });

  // Opening a document being processed was a dead end: the status said "being
  // integrated" and the page offered nothing to do about it, on the one screen
  // with room to explain the wait.
  // The page contradicted itself: "Traitement arrêté" in the header, and in red
  // below it "le traitement n'a pas abouti" plus a technical code — for
  // something the contributor had just chosen to do.
  it("does not report a deliberate stop as an incident", () => {
    vi.mocked(useSourceDocument).mockReturnValue({
      data: {
        ...baseDocument,
        status: "failed",
        failureCode: "CANCELLED_BY_CONTRIBUTOR",
      },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderPage();

    expect(screen.getByText("cancelledHelp")).toBeVisible();
    expect(screen.queryByText("processingFailureHelp")).toBeNull();
    expect(screen.queryByText("technicalDetails")).toBeNull();
    // Both ways forward stay available.
    expect(
      screen.getByRole("button", { name: "retryProcessing" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "removeDocument" }),
    ).toBeVisible();
  });

  it("offers a way out of a document that is still being processed", () => {
    vi.mocked(useSourceDocument).mockReturnValue({
      data: { ...baseDocument, status: "extracting" },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "cancelProcessing" }));

    expect(cancelProcessing).toHaveBeenCalledWith("document-1");
  });

  it("shows an incorporated uploaded document and its original", () => {
    renderPage();
    expect(
      screen.getByRole("heading", { name: "Architecture détaillée.pdf" }),
    ).toBeVisible();
    expect(screen.getByText("uploadedDocument")).toBeVisible();
    expect(screen.getByText("statusIncorporated")).toBeVisible();
    expect(screen.getByText("category_overview")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "downloadOriginal" }),
    ).toHaveAttribute("href", "https://files.example/brief");
  });

  it.each([
    ["received", "statusProcessing"],
    ["failed", "statusFailed"],
    ["removed", "statusRemoved"],
  ] as const)("maps %s to the %s visible state", (status, label) => {
    vi.mocked(useSourceDocument).mockReturnValue({
      data: {
        ...baseDocument,
        status,
        affectedCategories: [],
        originalDownloadUrl: null,
      },
      isPending: false,
      isError: false,
    } as never);
    renderPage();
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.queryByText("affectedCategories")).not.toBeInTheDocument();
  });

  it("renders Notion provenance and a provider failure", () => {
    vi.mocked(useSourceDocument).mockReturnValue({
      data: {
        ...baseDocument,
        kind: "notion",
        status: "removal_failed",
        failureCode: "DOCUMENT_STORAGE_REMOVAL_FAILED",
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

  it("offers processing retry and confirmed deletion for a failed document", () => {
    const retry = vi.fn();
    vi.mocked(useRetryDocumentProcessing).mockReturnValue({
      mutate: retry,
      isPending: false,
      isError: false,
    } as never);
    vi.mocked(useSourceDocument).mockReturnValue({
      data: {
        ...baseDocument,
        status: "failed",
        failureCode: "ANTHROPIC_INVALID_REQUEST",
      },
      isPending: false,
      isError: false,
    } as never);

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "retryProcessing" }));
    expect(retry).toHaveBeenCalledWith("document-1");
    fireEvent.click(screen.getByRole("button", { name: "removeDocument" }));
    expect(screen.getByText("remove-dialog")).toBeVisible();
  });

  it("offers a dedicated recovery when deletion itself failed", () => {
    const retry = vi.fn();
    vi.mocked(useRetryDocumentRemoval).mockReturnValue({
      mutate: retry,
      isPending: false,
      isError: false,
      data: undefined,
    } as never);
    vi.mocked(useSourceDocument).mockReturnValue({
      data: {
        ...baseDocument,
        status: "removal_failed",
        failureCode: "DOCUMENT_STORAGE_REMOVAL_FAILED",
      },
      isPending: false,
      isError: false,
    } as never);

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "retryRemoval" }));
    expect(retry).toHaveBeenCalledWith(
      "document-1",
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    const options = retry.mock.calls[0]?.[1] as {
      onSuccess: (result: { status: string }) => void;
    };
    options.onSuccess({ status: "completed" });
    expect(replace).toHaveBeenCalledWith("/projects/project-1/documents");
  });

  it("keeps processing recovery disabled while its retry is pending", () => {
    vi.mocked(useRetryDocumentProcessing).mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
      isError: false,
    } as never);
    vi.mocked(useSourceDocument).mockReturnValue({
      data: { ...baseDocument, status: "failed" },
      isPending: false,
      isError: false,
    } as never);

    renderPage();

    expect(
      screen.getByRole("button", { name: "retryingProcessing" }),
    ).toBeDisabled();
  });

  it("redirects clients without exposing the document", () => {
    vi.mocked(useProject).mockReturnValue({
      data: { role: "client" },
      isPending: false,
      isError: false,
    } as never);
    renderPage();
    expect(replace).toHaveBeenCalledWith("/projects/project-1");
    expect(
      screen.queryByText("Architecture détaillée.pdf"),
    ).not.toBeInTheDocument();
  });

  it("offers a retry when either query fails", () => {
    const refetch = vi.fn();
    vi.mocked(useSourceDocument).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    } as never);
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("keeps a skeleton while either dependency is loading", () => {
    vi.mocked(useProject).mockReturnValue({ isPending: true } as never);
    const { container } = renderPage();
    expect(container.firstChild).toHaveClass("h-40");
  });
});
