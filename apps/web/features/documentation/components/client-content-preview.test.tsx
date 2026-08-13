import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useClientContentPreview } from "../hooks";
import { ClientContentPreview } from "./client-content-preview";

vi.mock("../hooks", () => ({ useClientContentPreview: vi.fn() }));

const emptyRelease = {
  releaseId: null,
  sequence: 0,
  status: null,
  visibleToClient: false,
  readySectionCount: 0,
  expectedSectionCount: 0,
  sections: [],
  publishedAt: null,
};

describe("ClientContentPreview", () => {
  beforeEach(() => vi.clearAllMocks());

  // This section is deliberately last so the page closes on the answer to
  // "what does my client see". Rendering nothing on load or error defeated
  // that — the page ended on the editorial dropdowns instead, and a failed
  // fetch read as "nothing is published", which is a different and wrong fact.
  it("keeps the section present while the preview loads", () => {
    vi.mocked(useClientContentPreview).mockReturnValue({
      data: undefined,
      isPending: true,
    } as never);
    const { container } = render(<ClientContentPreview projectId="project-1" />);
    expect(screen.getByRole("heading", { name: /previewTitle/ })).toBeVisible();
    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("distinguishes a failed preview from nothing being published", () => {
    const refetch = vi.fn();
    vi.mocked(useClientContentPreview).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    } as never);
    render(<ClientContentPreview projectId="project-1" />);
    expect(screen.getByText("loadError")).toBeVisible();
    expect(screen.queryByText("empty")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "retry" }));
    expect(refetch).toHaveBeenCalled();
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
          sections: [
            {
              id: "00000000-0000-4000-8000-000000000009",
              name: "Le projet",
              blocks: [{ type: "paragraph", text: "Visible client text" }],
            },
          ],
        },
        pending: { ...emptyRelease, status: "preparing" },
      },
    } as never);
    render(<ClientContentPreview projectId="project-1" />);
    expect(screen.getByText("previousVisible")).toBeVisible();
    expect(screen.getByText("Le projet")).toBeVisible();
    expect(screen.getByText("Visible client text")).toBeVisible();
  });
});
