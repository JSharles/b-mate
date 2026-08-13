import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useReferenceSummary } from "../hooks";
import { SourceSummary } from "./source-summary";

vi.mock("../hooks", () => ({ useReferenceSummary: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("./clarifications-panel", () => ({
  ClarificationsPanel: () => <div>clarifications</div>,
}));

const revisionId = "00000000-0000-4000-8000-000000000001";

function withSummary(data: unknown, overrides: Record<string, unknown> = {}) {
  vi.mocked(useReferenceSummary).mockReturnValue({
    data,
    isPending: false,
    isError: false,
    ...overrides,
  } as never);
}

const held = {
  statementCount: 100,
  documentCount: 2,
  openPointCount: 2,
  sourceRevisionId: revisionId,
  lastChangedAt: new Date().toISOString(),
  needsRewrite: false,
  document: null,
};

describe("SourceSummary", () => {
  beforeEach(() => vi.clearAllMocks());

  // The whole point of specs/018: a hundred statements are stated, not listed.
  it("states what the source holds instead of listing it", () => {
    withSummary(held);

    render(<SourceSummary projectId="project-1" />);

    expect(screen.getByText("held")).toBeVisible();
  });

  it("keeps what needs an answer on the working page", () => {
    withSummary(held);

    render(<SourceSummary projectId="project-1" />);

    expect(screen.getByText("clarifications")).toBeVisible();
  });

  it("offers to write the document when there is none", () => {
    withSummary(held);

    render(<SourceSummary projectId="project-1" />);

    expect(
      screen.getByRole("link", { name: /writeDocument/ }),
    ).toHaveAttribute("href", "/projects/project-1/documentation/reference");
  });

  it("offers to read it once one exists", () => {
    withSummary({ ...held, document: { status: "ready" } });

    render(<SourceSummary projectId="project-1" />);

    expect(screen.getByRole("link", { name: /readDocument/ })).toBeVisible();
  });

  // FR-006: the source moved, so the document is owed a rewrite. It says so and
  // waits rather than rewriting itself.
  it("says the document is owed a rewrite when the source has moved", () => {
    withSummary({
      ...held,
      needsRewrite: true,
      document: { status: "ready" },
    });

    render(<SourceSummary projectId="project-1" />);

    expect(screen.getByText("needsRewrite")).toBeVisible();
  });

  it("says nothing about a rewrite before anything has been written", () => {
    withSummary({ ...held, needsRewrite: true, document: null });

    render(<SourceSummary projectId="project-1" />);

    expect(screen.queryByText("needsRewrite")).not.toBeInTheDocument();
  });

  it("invites a first document when the source is empty", () => {
    withSummary({ ...held, statementCount: 0, documentCount: 0 });

    render(<SourceSummary projectId="project-1" />);

    expect(screen.getByText("emptyTitle")).toBeVisible();
    expect(screen.queryByText("clarifications")).not.toBeInTheDocument();
  });

  // A failed request is not an empty source.
  it("says the state failed to load rather than showing an empty source", () => {
    withSummary(undefined, { isError: true });

    render(<SourceSummary projectId="project-1" />);

    expect(screen.getByRole("alert")).toHaveTextContent("loadError");
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });

  it("keeps the heading in place while it loads", () => {
    withSummary(undefined, { isPending: true });

    render(<SourceSummary projectId="project-1" />);

    expect(screen.getByRole("heading", { name: /title1/ })).toBeVisible();
  });
});
