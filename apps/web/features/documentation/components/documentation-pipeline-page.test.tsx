import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProject } from "@/features/projects/hooks";
import { DocumentationPipelinePage } from "./documentation-pipeline-page";

const replace = vi.fn();

vi.mock("@/features/projects/hooks", () => ({ useProject: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ replace }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("./documentation-workspace", () => ({
  DocumentationWorkspace: () => <div>documentation-workspace</div>,
}));

describe("DocumentationPipelinePage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the pipeline and a way back to the document inventory", () => {
    vi.mocked(useProject).mockReturnValue({
      data: { id: "project-1", role: "contributor" },
      isPending: false,
      isError: false,
    } as never);

    render(<DocumentationPipelinePage projectId="project-1" />);

    expect(screen.getByRole("heading", { name: "title" })).toBeVisible();
    expect(screen.getByText("documentation-workspace")).toBeVisible();
    // The two surfaces answer different questions on different days, so each
    // has to be able to reach the other.
    expect(screen.getByRole("link", { name: "manageDocuments" })).toHaveAttribute(
      "href",
      "/projects/project-1/documents",
    );
  });

  // Contributor-only, like the inventory. The API enforces the same rule
  // independently — this only spares a client a flash of a page they cannot use.
  it("sends a client back to the project", () => {
    vi.mocked(useProject).mockReturnValue({
      data: { id: "project-1", role: "client" },
      isPending: false,
      isError: false,
    } as never);

    render(<DocumentationPipelinePage projectId="project-1" />);

    expect(replace).toHaveBeenCalledWith("/projects/project-1");
    expect(screen.queryByText("documentation-workspace")).not.toBeInTheDocument();
  });

  it("offers a retry when the project cannot be loaded", () => {
    const refetch = vi.fn();
    vi.mocked(useProject).mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    } as never);

    render(<DocumentationPipelinePage projectId="project-1" />);

    expect(screen.getByText("loadError")).toBeVisible();
    screen.getByRole("button", { name: "retry" }).click();
    expect(refetch).toHaveBeenCalled();
  });
});
