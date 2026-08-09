import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useProject } from "@/features/projects/hooks";
import ProjectTeamPage from "./page";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, use: (value: unknown) => value };
});

vi.mock("@/features/projects/hooks", () => ({
  useProject: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/invitations/components/invite-button", () => ({
  InviteButton: ({ projectId }: { projectId: string }) => <div>invite-button:{projectId}</div>,
}));

vi.mock("@/features/invitations/components/invitations-list", () => ({
  InvitationsList: ({ projectId }: { projectId: string }) => (
    <div>invitations-list:{projectId}</div>
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
  return render(<ProjectTeamPage params={{ id: "project-1" } as unknown as Promise<{ id: string }>} />);
}

function mockLoaded(role: "contributor" | "client", isAdmin: boolean) {
  mockedUseProject.mockReturnValue({
    data: { id: "project-1", title: "Site vitrine client X", role, isAdmin },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useProject>);
}

describe("ProjectTeamPage", () => {
  it("shows the member list to a non-admin contributor without invite/pending management", () => {
    mockLoaded("contributor", false);

    renderPage();

    expect(screen.getByText("project-members-list:project-1:false")).toBeInTheDocument();
    expect(screen.queryByText("invite-button:project-1")).not.toBeInTheDocument();
    expect(screen.queryByText("invitations-list:project-1")).not.toBeInTheDocument();
  });

  it("gives an admin contributor invite and pending-invitation management", () => {
    mockLoaded("contributor", true);

    renderPage();

    expect(screen.getByText("project-members-list:project-1:true")).toBeInTheDocument();
    expect(screen.getByText("invite-button:project-1")).toBeInTheDocument();
    expect(screen.getByText("invitations-list:project-1")).toBeInTheDocument();
  });

  it("is visible to a non-admin client, read-only", () => {
    mockLoaded("client", false);

    renderPage();

    expect(screen.getByText("project-members-list:project-1:false")).toBeInTheDocument();
    expect(screen.queryByText("invite-button:project-1")).not.toBeInTheDocument();
    expect(screen.queryByText("invitations-list:project-1")).not.toBeInTheDocument();
  });

  it("gives an admin client the same management capability as an admin contributor", () => {
    mockLoaded("client", true);

    renderPage();

    expect(screen.getByText("project-members-list:project-1:true")).toBeInTheDocument();
    expect(screen.getByText("invite-button:project-1")).toBeInTheDocument();
    expect(screen.getByText("invitations-list:project-1")).toBeInTheDocument();
  });

  it("shows a back link to the project", () => {
    mockLoaded("contributor", true);

    renderPage();

    expect(screen.getByRole("link", { name: "backToProject" })).toHaveAttribute(
      "href",
      "/projects/project-1",
    );
  });

  it("shows a skeleton while pending", () => {
    mockedUseProject.mockReturnValue({
      data: undefined,
      isPending: true,
    } as unknown as ReturnType<typeof useProject>);

    const { container } = renderPage();

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("shows an error state with a retry action when the project fails to load", () => {
    mockedUseProject.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useProject>);

    renderPage();

    expect(screen.getByText("loadErrorTitle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "loadErrorRetry" })).toBeInTheDocument();
  });

  it("calls refetch when the retry button is clicked", async () => {
    const refetch = vi.fn();
    mockedUseProject.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof useProject>);
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole("button", { name: "loadErrorRetry" }));

    expect(refetch).toHaveBeenCalled();
  });
});
