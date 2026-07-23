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

vi.mock("@/features/board-connections/components/board-connection-card", () => ({
  BoardConnectionCard: ({ projectId }: { projectId: string }) => (
    <div>board-connection-card:{projectId}</div>
  ),
}));

vi.mock("@/features/current-task/components/current-task-card", () => ({
  CurrentTaskCard: ({ projectId }: { projectId: string }) => (
    <div>current-task-card:{projectId}</div>
  ),
}));

vi.mock("@/features/projects/components/project-members-list", () => ({
  ProjectMembersList: ({
    projectId,
    canManageMembers,
  }: {
    projectId: string;
    canManageMembers: boolean;
  }) => (
    <div>
      project-members-list:{projectId}:{String(canManageMembers)}
    </div>
  ),
}));

const mockedUseProject = vi.mocked(useProject);

function renderPage() {
  return render(
    <ProjectPage params={{ id: "project-1" } as unknown as Promise<{ id: string }>} />,
  );
}

function mockProject(role: "contributor" | "client", isAdmin: boolean) {
  mockedUseProject.mockReturnValue({
    data: { id: "project-1", title: "Site vitrine client X", role, isAdmin },
    isPending: false,
  } as unknown as ReturnType<typeof useProject>);
}

describe("ProjectPage", () => {
  it("shows full management view to a contributor admin", () => {
    mockProject("contributor", true);

    renderPage();

    expect(screen.getByText("Site vitrine client X")).toBeInTheDocument();
    expect(screen.getByText("project-members-list:project-1:true")).toBeInTheDocument();
    expect(screen.getByText("invitations-card:project-1")).toBeInTheDocument();
    expect(screen.getByText("board-connection-card:project-1")).toBeInTheDocument();
    expect(screen.getByText("documentation")).toBeInTheDocument();
    expect(screen.queryByText("overview")).not.toBeInTheDocument();
    expect(screen.queryByText("current-task-card:project-1")).not.toBeInTheDocument();
  });

  it("hides invitations but keeps dev-tooling placeholders for a non-admin contributor", () => {
    mockProject("contributor", false);

    renderPage();

    expect(screen.getByText("project-members-list:project-1:false")).toBeInTheDocument();
    expect(screen.queryByText("invitations-card:project-1")).not.toBeInTheDocument();
    expect(screen.getByText("board-connection-card:project-1")).toBeInTheDocument();
    expect(screen.getByText("documentation")).toBeInTheDocument();
  });

  it("shows only the read-only client placeholders for a non-admin client", () => {
    mockProject("client", false);

    renderPage();

    expect(screen.getByText("project-members-list:project-1:false")).toBeInTheDocument();
    expect(screen.queryByText("invitations-card:project-1")).not.toBeInTheDocument();
    expect(screen.queryByText("board-connection-card:project-1")).not.toBeInTheDocument();
    expect(screen.queryByText("documentation")).not.toBeInTheDocument();

    expect(screen.getByText("overview")).toBeInTheDocument();
    expect(screen.getByText("discoveryAudit")).toBeInTheDocument();
    expect(screen.getByText("technicalDecisions")).toBeInTheDocument();
    expect(screen.getByText("roadmap")).toBeInTheDocument();
    expect(screen.getByText("clientDocumentation")).toBeInTheDocument();
    expect(screen.getByText("current-task-card:project-1")).toBeInTheDocument();
  });

  it("gives an admin client invitation management but not the dev-tooling placeholders", () => {
    mockProject("client", true);

    renderPage();

    expect(screen.getByText("project-members-list:project-1:true")).toBeInTheDocument();
    expect(screen.getByText("invitations-card:project-1")).toBeInTheDocument();
    expect(screen.queryByText("board-connection-card:project-1")).not.toBeInTheDocument();
    expect(screen.queryByText("documentation")).not.toBeInTheDocument();
    expect(screen.getByText("overview")).toBeInTheDocument();
    expect(screen.getByText("current-task-card:project-1")).toBeInTheDocument();
  });

  it("shows no form control anywhere among the client placeholders", () => {
    mockProject("client", false);

    renderPage();

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload/i })).not.toBeInTheDocument();
  });

  it("shows nothing when the project is missing", () => {
    mockedUseProject.mockReturnValue({
      data: undefined,
      isPending: false,
    } as unknown as ReturnType<typeof useProject>);

    const { container } = renderPage();

    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing when the query errors, even with a stale project still cached from a prior session", () => {
    mockedUseProject.mockReturnValue({
      data: { id: "project-1", title: "Someone else's project", role: "contributor", isAdmin: true },
      isPending: false,
      isError: true,
    } as unknown as ReturnType<typeof useProject>);

    const { container } = renderPage();

    expect(container).toBeEmptyDOMElement();
  });
});
