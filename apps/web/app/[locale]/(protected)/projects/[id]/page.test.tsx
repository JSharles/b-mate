import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useProject } from "@/features/projects/hooks";
import ProjectPage from "./page";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, use: (value: unknown) => value };
});

vi.mock("@/features/projects/hooks", () => ({
  useProject: vi.fn(),
}));

vi.mock("@/features/invitations/components/invitations-card", () => ({
  InvitationsCard: ({ projectId }: { projectId: string }) => (
    <div>invitations-card:{projectId}</div>
  ),
}));

vi.mock("@/features/projects/components/project-members-list", () => ({
  ProjectMembersList: ({ projectId }: { projectId: string }) => (
    <div>project-members-list:{projectId}</div>
  ),
}));

const mockedUseProject = vi.mocked(useProject);

function renderPage() {
  return render(
    <ProjectPage params={{ id: "project-1" } as unknown as Promise<{ id: string }>} />,
  );
}

describe("ProjectPage", () => {
  it("renders the project title, members, invitations, and the settings/documentation placeholders", () => {
    mockedUseProject.mockReturnValue({
      data: { id: "project-1", title: "Site vitrine client X" },
      isPending: false,
    } as unknown as ReturnType<typeof useProject>);

    renderPage();

    expect(screen.getByText("Site vitrine client X")).toBeInTheDocument();
    expect(screen.getByText("members")).toBeInTheDocument();
    expect(screen.getByText("project-members-list:project-1")).toBeInTheDocument();
    expect(screen.getByText("invitations-card:project-1")).toBeInTheDocument();
    expect(screen.getByText("settings")).toBeInTheDocument();
    expect(screen.getByText("settingsComingSoon")).toBeInTheDocument();
    expect(screen.getByText("documentation")).toBeInTheDocument();
    expect(screen.getByText("documentationComingSoon")).toBeInTheDocument();
  });

  it("shows nothing when the project is missing", () => {
    mockedUseProject.mockReturnValue({
      data: undefined,
      isPending: false,
    } as unknown as ReturnType<typeof useProject>);

    const { container } = renderPage();

    expect(container).toBeEmptyDOMElement();
  });
});
