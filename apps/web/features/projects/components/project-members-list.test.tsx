import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useProjectMembers, useRemoveMember } from "../hooks";
import { ProjectMembersList } from "./project-members-list";

vi.mock("../hooks", () => ({
  useProjectMembers: vi.fn(),
  useRemoveMember: vi.fn(),
}));

const mockedUseProjectMembers = vi.mocked(useProjectMembers);
const mockedUseRemoveMember = vi.mocked(useRemoveMember);

function stubRemoveMember() {
  const mutate = vi.fn();
  mockedUseRemoveMember.mockReturnValue({
    mutate,
    isPending: false,
    variables: undefined,
  } as unknown as ReturnType<typeof useRemoveMember>);
  return mutate;
}

describe("ProjectMembersList", () => {
  it("shows an empty message when there are no members", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);
    stubRemoveMember();

    render(<ProjectMembersList projectId="project-1" canManageMembers={true} />);

    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  it("shows the empty message instead of stale members when the query is in an error state", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [
        {
          userId: "user-1",
          firstName: "Jean",
          lastName: "Charles",
          email: "jc@example.com",
          isAdmin: true,
        },
      ],
      isPending: false,
      isError: true,
    } as unknown as ReturnType<typeof useProjectMembers>);
    stubRemoveMember();

    render(<ProjectMembersList projectId="project-1" canManageMembers={true} />);

    expect(screen.getByText("empty")).toBeInTheDocument();
    expect(screen.queryByText("jc@example.com")).not.toBeInTheDocument();
  });

  it("lists each member with a remove action, and marks admins", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [
        {
          userId: "user-1",
          firstName: "Jean",
          lastName: "Charles",
          email: "jc@example.com",
          isAdmin: true,
        },
        {
          userId: "user-2",
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
          isAdmin: false,
        },
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);
    stubRemoveMember();

    render(<ProjectMembersList projectId="project-1" canManageMembers={true} />);

    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "remove" })).toHaveLength(2);
  });

  it("removes a member when the remove action is clicked", async () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [
        {
          userId: "user-1",
          firstName: "Jean",
          lastName: "Charles",
          email: "jc@example.com",
          isAdmin: true,
        },
        {
          userId: "user-2",
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
          isAdmin: false,
        },
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);
    const mutate = stubRemoveMember();
    const user = userEvent.setup();

    render(<ProjectMembersList projectId="project-1" canManageMembers={true} />);
    await user.click(screen.getAllByRole("button", { name: "remove" })[1]);

    expect(mutate).toHaveBeenCalledWith("user-2");
  });

  it("disables the remove action for the project's only admin", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [
        {
          userId: "user-1",
          firstName: "Jean",
          lastName: "Charles",
          email: "jc@example.com",
          isAdmin: true,
        },
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);
    stubRemoveMember();

    render(<ProjectMembersList projectId="project-1" canManageMembers={true} />);

    expect(screen.getByRole("button", { name: "remove" })).toBeDisabled();
  });

  it("hides the remove action entirely when the viewer cannot manage members", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [
        {
          userId: "user-1",
          firstName: "Jean",
          lastName: "Charles",
          email: "jc@example.com",
          isAdmin: true,
        },
        {
          userId: "user-2",
          firstName: "Ada",
          lastName: "Lovelace",
          email: "ada@example.com",
          isAdmin: false,
        },
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);
    stubRemoveMember();

    render(<ProjectMembersList projectId="project-1" canManageMembers={false} />);

    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "remove" })).not.toBeInTheDocument();
  });
});
