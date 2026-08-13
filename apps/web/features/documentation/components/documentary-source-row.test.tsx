import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useReferenceSummary } from "../hooks";
import { DocumentarySourceRow } from "./documentary-source-row";

vi.mock("../hooks", () => ({ useReferenceSummary: vi.fn() }));
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

describe("DocumentarySourceRow", () => {
  beforeEach(() => vi.clearAllMocks());

  // The documents sit with Board, Notion and the preferences, because that is
  // what they are: configured once, revisited when they change.
  it("offers the way to the documents from the project's settings", () => {
    withSummary({ documentCount: 2, document: { status: "ready" } });

    render(<DocumentarySourceRow projectId="project-1" />);

    expect(screen.getByRole("link", { name: /manage/ })).toHaveAttribute(
      "href",
      "/projects/project-1/documentation/sources",
    );
  });

  it("invites a first document rather than offering to manage none", () => {
    withSummary({ documentCount: 0, document: null });

    render(<DocumentarySourceRow projectId="project-1" />);

    expect(screen.getByText("noDocuments")).toBeVisible();
    expect(screen.getByRole("link", { name: /start/ })).toBeVisible();
  });

  it.each([
    [{ documentCount: 2, document: { status: "writing" } }, "writing"],
    [{ documentCount: 2, document: { status: "failed" } }, "failed"],
    [{ documentCount: 2, document: null }, "notWritten"],
    [
      { documentCount: 2, document: { status: "ready" }, needsRewrite: true },
      "owed",
    ],
    [
      { documentCount: 2, document: { status: "ready" }, openPointCount: 3 },
      "readyWithPoints",
    ],
    [{ documentCount: 2, document: { status: "ready" } }, "ready"],
  ])("says where the documents stand (%#)", (summary, label) => {
    withSummary(summary);

    render(<DocumentarySourceRow projectId="project-1" />);

    expect(screen.getByText(label)).toBeVisible();
  });
});
