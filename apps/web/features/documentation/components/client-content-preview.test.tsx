import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useClientContentPreview } from "../hooks";
import { ClientContentPreview } from "./client-content-preview";

vi.mock("../hooks", () => ({ useClientContentPreview: vi.fn() }));

const emptyRelease = {
  releaseId: null,
  sequence: 0,
  status: null,
  visibleToClient: false,
  readyCategoryCount: 0,
  expectedCategoryCount: 0,
  categories: [],
  publishedAt: null,
};

describe("ClientContentPreview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing before the preview query resolves", () => {
    vi.mocked(useClientContentPreview).mockReturnValue({ data: undefined } as never);
    const { container } = render(<ClientContentPreview projectId="project-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("explains that nothing has been published yet", () => {
    vi.mocked(useClientContentPreview).mockReturnValue({
      data: { current: emptyRelease, pending: null },
    } as never);
    render(<ClientContentPreview projectId="project-1" />);
    expect(screen.getByText("exactVisible")).toBeVisible();
    expect(screen.getByText("empty")).toBeVisible();
  });

  it("shows the exact current release while a replacement is pending", () => {
    vi.mocked(useClientContentPreview).mockReturnValue({
      data: {
        current: {
          ...emptyRelease,
          releaseId: "00000000-0000-4000-8000-000000000001",
          categories: [
            {
              categoryKey: "overview",
              blocks: [{ type: "paragraph", text: "Visible client text" }],
            },
          ],
        },
        pending: { ...emptyRelease, status: "preparing" },
      },
    } as never);
    render(<ClientContentPreview projectId="project-1" />);
    expect(screen.getByText("previousVisible")).toBeVisible();
    expect(screen.getByText("category_overview")).toBeVisible();
    expect(screen.getByText("Visible client text")).toBeVisible();
  });
});
