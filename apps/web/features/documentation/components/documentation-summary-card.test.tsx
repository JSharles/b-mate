import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentationWorkspace, useReferenceSummary } from "../hooks";
import { DocumentationSummaryCard } from "./documentation-summary-card";

vi.mock("../hooks", () => ({
  useDocumentationWorkspace: vi.fn(),
  useReferenceSummary: vi.fn(),
}));
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
}));

function withSummary(data: Record<string, unknown>) {
  vi.mocked(useReferenceSummary).mockReturnValue({
    data,
    isPending: false,
    isError: false,
  } as never);
}

describe("DocumentationSummaryCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDocumentationWorkspace).mockReturnValue({
      data: { priority: "published" },
      isPending: false,
      isError: false,
    } as never);
    withSummary({ documentCount: 2, document: { status: "ready" } });
  });

  // One door: the documents are a setting behind it, not a second feature
  // beside it.
  it("offers one way in, to the client documentation", () => {
    render(<DocumentationSummaryCard projectId="project-1" />);

    expect(screen.getByRole("link", { name: /title/ })).toHaveAttribute(
      "href",
      "/projects/project-1/documentation",
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  // Before a reference document exists there is nothing to say about chapters,
  // so the card says what the project is actually waiting for.
  it.each([
    [{ documentCount: 0, document: null }, "stateNoDocuments"],
    [{ documentCount: 2, document: null }, "stateNotWritten"],
    [{ documentCount: 2, document: { status: "writing" } }, "stateWriting"],
    [{ documentCount: 2, document: { status: "ready" } }, "priority_published"],
  ])("says what the project is waiting for (%#)", (summary, label) => {
    withSummary(summary);

    render(<DocumentationSummaryCard projectId="project-1" />);

    expect(screen.getByText(label)).toBeVisible();
  });

  it("carries what waits for the developer once there is a document", () => {
    vi.mocked(useDocumentationWorkspace).mockReturnValue({
      data: { priority: "needs_action" },
      isPending: false,
      isError: false,
    } as never);

    render(<DocumentationSummaryCard projectId="project-1" />);

    expect(screen.getByText("priority_needs_action")).toBeVisible();
  });
});
