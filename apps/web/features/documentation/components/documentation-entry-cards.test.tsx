import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentationWorkspace, useReferenceSummary } from "../hooks";
import { DocumentationEntryCards } from "./documentation-entry-cards";

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

describe("DocumentationEntryCards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDocumentationWorkspace).mockReturnValue({
      data: { priority: "published" },
      isPending: false,
      isError: false,
    } as never);
    withSummary({ documentCount: 2, document: { status: "ready" } });
  });

  it("offers the two jobs in the order they happen", () => {
    render(<DocumentationEntryCards projectId="project-1" />);

    expect(screen.getByRole("link", { name: /baseTitle/ })).toHaveAttribute(
      "href",
      "/projects/project-1/documents",
    );
    expect(screen.getByRole("link", { name: /clientTitle/ })).toHaveAttribute(
      "href",
      "/projects/project-1/client",
    );
  });

  // A locked door is shown rather than hidden — knowing the job exists and what
  // it waits for is the point — but it is not a link, so a keyboard user cannot
  // reach a surface that would only turn them away.
  it("shows the client job as waiting, and does not let it be opened", () => {
    withSummary({ documentCount: 2, document: null });

    render(<DocumentationEntryCards projectId="project-1" />);

    expect(screen.getByText("clientTitle")).toBeVisible();
    expect(screen.getByText("clientLocked")).toBeVisible();
    expect(
      screen.queryByRole("link", { name: /clientTitle/ }),
    ).not.toBeInTheDocument();
  });

  it.each([
    [{ documentCount: 0, document: null }, "baseEmpty"],
    [{ documentCount: 2, document: null }, "baseNotWritten"],
    [{ documentCount: 2, document: { status: "writing" } }, "baseWriting"],
    [{ documentCount: 2, document: { status: "failed" } }, "baseFailed"],
    [{ documentCount: 2, document: { status: "ready" } }, "baseReady"],
  ])("says where the base stands (%#)", (summary, label) => {
    withSummary(summary);

    render(<DocumentationEntryCards projectId="project-1" />);

    expect(screen.getByText(label)).toBeVisible();
  });

  it("carries what waits for the developer onto the client card", () => {
    vi.mocked(useDocumentationWorkspace).mockReturnValue({
      data: { priority: "needs_action" },
      isPending: false,
      isError: false,
    } as never);

    render(<DocumentationEntryCards projectId="project-1" />);

    expect(screen.getByText("priority_needs_action")).toBeVisible();
  });
});
