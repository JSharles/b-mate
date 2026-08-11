import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentationWorkspace } from "../hooks";
import { DocumentationWorkspace } from "./documentation-workspace";

vi.mock("../hooks", () => ({ useDocumentationWorkspace: vi.fn() }));
vi.mock("./canonical-source-view", () => ({
  CanonicalSourceView: () => <div>canonical-source</div>,
}));
vi.mock("./category-review-list", () => ({
  CategoryReviewList: () => <div>category-reviews</div>,
}));
vi.mock("./client-content-preview", () => ({
  ClientContentPreview: () => <div>client-preview</div>,
}));
vi.mock("./editorial-profile-settings", () => ({
  EditorialProfileSettings: () => <div>editorial-profile</div>,
}));

describe("DocumentationWorkspace", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["needs_attention", "priority_needs_attention"],
    ["processing", "priority_processing"],
    ["published", "priority_published"],
  ] as const)("shows the %s priority", (priority, label) => {
    vi.mocked(useDocumentationWorkspace).mockReturnValue({
      data: {
        priority,
        clientVisibility: "previous_version_visible",
        releaseProgress: { ready: 2, expected: 4 },
      },
      isError: false,
    } as never);

    render(<DocumentationWorkspace projectId="project-1" />);

    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByText("visibility_previous_version_visible")).toBeVisible();
    // Atomic publication used to be a bare "· 2/4" glued onto the sentence
    // above; a contributor has to be able to read what is still missing and
    // why nothing has moved for their client yet.
    expect(screen.getByText("releaseProgress")).toBeVisible();
    expect(screen.getByText("releaseAtomic")).toBeVisible();
    expect(screen.getByText("canonical-source")).toBeVisible();
  });

  it("keeps the workspace usable when a refresh is delayed", () => {
    vi.mocked(useDocumentationWorkspace).mockReturnValue({
      data: undefined,
      isError: true,
    } as never);

    render(<DocumentationWorkspace projectId="project-1" />);

    expect(screen.getByText("priority_empty")).toBeVisible();
    // A delayed refresh is de-emphasised, not accented: periwinkle is the only
    // colour allowed to mean emphasis (DESIGN.md, One Voice Rule).
    expect(screen.getByText("refreshDelayed")).toHaveClass("text-muted-foreground");
  });

  // The client preview answers the only question a contributor arrives with —
  // what does my client see? It used to sit third of four, so the page closed
  // on a settings form instead.
  it("closes on the client view and offers a way to reach each section", () => {
    vi.mocked(useDocumentationWorkspace).mockReturnValue({
      data: { priority: "published", clientVisibility: "current_version_visible" },
      isError: false,
    } as never);

    render(<DocumentationWorkspace projectId="project-1" />);

    const sections = ["canonical-source", "category-reviews", "editorial-profile", "client-preview"];
    const rendered = sections.map((name) => screen.getByText(name));
    for (let index = 0; index < rendered.length - 1; index++) {
      expect(
        rendered[index].compareDocumentPosition(rendered[index + 1]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }

    const nav = screen.getByRole("navigation", { name: "navLabel" });
    expect(within(nav).getAllByRole("link")).toHaveLength(4);
    expect(within(nav).getByRole("link", { name: "navClient" })).toHaveAttribute(
      "href",
      "#documentation-client",
    );
  });
});
