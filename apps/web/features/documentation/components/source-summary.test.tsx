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

function withSummary(data: unknown, overrides: Record<string, unknown> = {}) {
  vi.mocked(useReferenceSummary).mockReturnValue({
    data,
    isPending: false,
    isError: false,
    ...overrides,
  } as never);
}

const held = {
  documentCount: 2,
  noteCount: 3,
  openPointCount: 2,
  needsRewrite: false,
  document: null,
};

describe("SourceSummary", () => {
  beforeEach(() => vi.clearAllMocks());

  // The whole point of specs/018: what the source holds is stated, not listed.
  it("states what the source holds instead of listing it", () => {
    withSummary(held);

    render(<SourceSummary projectId="project-1" />);

    expect(screen.getByText("held")).toBeVisible();
  });

  // FR-016c: a count and a way in. The points are answered where they appear,
  // in the document — there is no second surface for them here.
  it("counts what is still open without listing any of it", () => {
    withSummary(held);

    render(<SourceSummary projectId="project-1" />);

    expect(screen.getByText("openPoints")).toBeVisible();
  });

  it("says nothing about open points when there are none", () => {
    withSummary({ ...held, openPointCount: 0 });

    render(<SourceSummary projectId="project-1" />);

    expect(screen.queryByText("openPoints")).not.toBeInTheDocument();
  });

  // Adding a document writes the document on its own, so a project with
  // documents and no document yet is one that is writing.
  it("says the document is being written when there is none yet", () => {
    withSummary(held);

    render(<SourceSummary projectId="project-1" />);

    expect(
      screen.getByRole("link", { name: /writingDocument/ }),
    ).toHaveAttribute("href", "/projects/project-1/documentation/reference");
  });

  it("offers to read it once one exists", () => {
    withSummary({ ...held, document: { status: "ready" } });

    render(<SourceSummary projectId="project-1" />);

    expect(screen.getByRole("link", { name: /readDocument/ })).toBeVisible();
  });

  // FR-006: what is owed is what the developer added themselves. A document
  // arriving writes the reference document on its own, so it never shows here.
  it("says how much of what the developer added is not in the document yet", () => {
    withSummary({ ...held, needsRewrite: true, document: { status: "ready" } });

    render(<SourceSummary projectId="project-1" />);

    expect(screen.getByText("needsRewrite")).toBeVisible();
  });

  it("says nothing is owed when the developer has added nothing", () => {
    withSummary({
      ...held,
      noteCount: 0,
      needsRewrite: true,
      document: { status: "ready" },
    });

    render(<SourceSummary projectId="project-1" />);

    expect(screen.queryByText("needsRewrite")).not.toBeInTheDocument();
  });

  it("says nothing about a rewrite before anything has been written", () => {
    withSummary({ ...held, needsRewrite: true, document: null });

    render(<SourceSummary projectId="project-1" />);

    expect(screen.queryByText("needsRewrite")).not.toBeInTheDocument();
  });

  it("invites a first document when the source is empty", () => {
    withSummary({ ...held, documentCount: 0, noteCount: 0, openPointCount: 0 });

    render(<SourceSummary projectId="project-1" />);

    expect(screen.getByText("emptyTitle")).toBeVisible();
    expect(screen.queryByText("held")).not.toBeInTheDocument();
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
