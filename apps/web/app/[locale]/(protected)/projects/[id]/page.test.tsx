import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

vi.mock("@/features/projects/components/team-summary-card", () => ({
  TeamSummaryCard: ({ projectId }: { projectId: string }) => (
    <div>team-summary-card:{projectId}</div>
  ),
}));

vi.mock("@/features/projects/components/team-panel", () => ({
  TeamPanel: ({ projectId }: { projectId: string }) => <div>team-panel:{projectId}</div>,
}));

vi.mock("@/features/resources/components/resources-list", () => ({
  ResourcesList: ({ projectId }: { projectId: string }) => (
    <div>resources-list:{projectId}</div>
  ),
}));

vi.mock("@/features/board-connections/components/board-connection-card", () => ({
  BoardConnectionCard: ({ projectId }: { projectId: string }) => (
    <div>board-connection-card:{projectId}</div>
  ),
}));

vi.mock("@/features/notion-connection/components/notion-connection-card", () => ({
  NotionConnectionCard: ({ projectId }: { projectId: string }) => (
    <div>notion-connection-card:{projectId}</div>
  ),
}));

vi.mock("@/features/projects/components/meeting-link-card", () => ({
  MeetingLinkCard: ({ projectId }: { projectId: string }) => (
    <div>meeting-link-card:{projectId}</div>
  ),
}));

vi.mock("@/features/projects/components/meeting-card", () => ({
  MeetingCard: ({ projectId }: { projectId: string }) => <div>meeting-card:{projectId}</div>,
}));

vi.mock("@/features/projects/components/project-preferences", () => ({
  ProjectPreferences: ({ projectId }: { projectId: string }) => (
    <div>project-preferences:{projectId}</div>
  ),
}));

vi.mock("./client-main-tabs", () => ({
  ClientMainTabs: ({ projectId }: { projectId: string }) => (
    <div>client-main-tabs:{projectId}</div>
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
  it("shows a classic settings-style page (Team, Resources, Board, Notion, Meeting link) to a contributor admin", () => {
    mockProject("contributor", true);

    renderPage();

    expect(screen.getByText("Site vitrine client X")).toBeInTheDocument();
    expect(screen.getByText("team-summary-card:project-1")).toBeInTheDocument();
    expect(screen.getByText("resources-list:project-1")).toBeInTheDocument();
    expect(screen.getByText("board-connection-card:project-1")).toBeInTheDocument();
    expect(screen.getByText("notion-connection-card:project-1")).toBeInTheDocument();
    expect(screen.getByText("meeting-link-card:project-1")).toBeInTheDocument();
    expect(screen.getByText("project-preferences:project-1")).toBeInTheDocument();
    expect(screen.queryByText("client-main-tabs:project-1")).not.toBeInTheDocument();
  });

  it("shows no join-meeting shortcut when the project has no meeting link", () => {
    mockProject("contributor", true);

    renderPage();

    expect(screen.queryByRole("link", { name: "joinMeeting" })).not.toBeInTheDocument();
  });

  it("shows a join-meeting shortcut next to the title when a meeting link is set, for a contributor", () => {
    mockedUseProject.mockReturnValue({
      data: {
        id: "project-1",
        title: "Site vitrine client X",
        role: "contributor",
        isAdmin: true,
        meetingUrl: "https://meet.google.com/abc-defg-hij",
      },
      isPending: false,
    } as unknown as ReturnType<typeof useProject>);

    renderPage();

    expect(screen.getByRole("link", { name: "joinMeeting" })).toHaveAttribute(
      "href",
      "https://meet.google.com/abc-defg-hij",
    );
  });

  it("shows the same join-meeting shortcut for a client, not just a contributor", () => {
    mockedUseProject.mockReturnValue({
      data: {
        id: "project-1",
        title: "Site vitrine client X",
        role: "client",
        isAdmin: false,
        meetingUrl: "https://meet.google.com/abc-defg-hij",
      },
      isPending: false,
    } as unknown as ReturnType<typeof useProject>);

    renderPage();

    expect(screen.getByRole("link", { name: "joinMeeting" })).toHaveAttribute(
      "href",
      "https://meet.google.com/abc-defg-hij",
    );
  });

  it("shows the same full set of sections for a non-admin contributor", () => {
    mockProject("contributor", false);

    renderPage();

    expect(screen.getByText("team-summary-card:project-1")).toBeInTheDocument();
    expect(screen.getByText("resources-list:project-1")).toBeInTheDocument();
    expect(screen.getByText("board-connection-card:project-1")).toBeInTheDocument();
    expect(screen.getByText("notion-connection-card:project-1")).toBeInTheDocument();
    expect(screen.getByText("meeting-link-card:project-1")).toBeInTheDocument();
    expect(screen.getByText("project-preferences:project-1")).toBeInTheDocument();
  });

  it("orders contributor sections by usage frequency, with Board and Notion grouped under a Tools heading and Timezone/Date format/Language under Preferences", () => {
    mockProject("contributor", true);

    renderPage();

    const labels = [
      "resources-list:project-1",
      "team-summary-card:project-1",
      "tools",
      "board-connection-card:project-1",
      "notion-connection-card:project-1",
      "meeting-link-card:project-1",
      "preferences",
      "project-preferences:project-1",
    ];
    for (let i = 0; i < labels.length - 1; i++) {
      const current = screen.getByText(labels[i]);
      const next = screen.getByText(labels[i + 1]);
      expect(
        current.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("shows only the read-only client view for a non-admin client", () => {
    mockProject("client", false);

    renderPage();

    expect(screen.queryByText("team-summary-card:project-1")).not.toBeInTheDocument();
    expect(screen.queryByText("resources-list:project-1")).not.toBeInTheDocument();
    expect(screen.queryByText("board-connection-card:project-1")).not.toBeInTheDocument();
    expect(screen.queryByText("notion-connection-card:project-1")).not.toBeInTheDocument();
    expect(screen.queryByText("meeting-link-card:project-1")).not.toBeInTheDocument();

    expect(screen.getByText("team-panel:project-1")).toBeInTheDocument();
    expect(screen.getByText("meeting-card:project-1")).toBeInTheDocument();
    expect(screen.getByText("client-main-tabs:project-1")).toBeInTheDocument();
  });

  it("gives an admin client the same read-only project view as any client", () => {
    mockProject("client", true);

    renderPage();

    expect(screen.queryByText("team-summary-card:project-1")).not.toBeInTheDocument();
    expect(screen.queryByText("resources-list:project-1")).not.toBeInTheDocument();
    expect(screen.getByText("team-panel:project-1")).toBeInTheDocument();
    expect(screen.getByText("client-main-tabs:project-1")).toBeInTheDocument();
  });

  it("shows no form control anywhere among the client placeholders", () => {
    mockProject("client", false);

    renderPage();

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /upload/i })).not.toBeInTheDocument();
  });

  it("shows an explicit error state with a retry action when the project is missing", () => {
    mockedUseProject.mockReturnValue({
      data: undefined,
      isPending: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useProject>);

    renderPage();

    expect(screen.getByText("loadErrorTitle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "loadErrorRetry" })).toBeInTheDocument();
  });

  it("shows the error state, not a stale project from a prior session, when the query errors", () => {
    mockedUseProject.mockReturnValue({
      data: { id: "project-1", title: "Someone else's project", role: "contributor", isAdmin: true },
      isPending: false,
      isError: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useProject>);

    renderPage();

    expect(screen.queryByText("Someone else's project")).not.toBeInTheDocument();
    expect(screen.getByText("loadErrorTitle")).toBeInTheDocument();
  });

  it("calls refetch when the retry button is clicked", async () => {
    const refetch = vi.fn();
    mockedUseProject.mockReturnValue({
      data: undefined,
      isPending: false,
      refetch,
    } as unknown as ReturnType<typeof useProject>);
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole("button", { name: "loadErrorRetry" }));

    expect(refetch).toHaveBeenCalled();
  });
});
