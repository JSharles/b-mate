import { render, screen } from "@testing-library/react";
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
    expect(
      screen.getByText("visibility_previous_version_visible · 2/4"),
    ).toBeVisible();
    expect(screen.getByText("canonical-source")).toBeVisible();
  });

  it("keeps the workspace usable when a refresh is delayed", () => {
    vi.mocked(useDocumentationWorkspace).mockReturnValue({
      data: undefined,
      isError: true,
    } as never);

    render(<DocumentationWorkspace projectId="project-1" />);

    expect(screen.getByText("priority_empty")).toBeVisible();
    expect(screen.getByText("refreshDelayed")).toHaveClass("text-amber-300");
  });
});
