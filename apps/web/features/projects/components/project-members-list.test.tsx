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

    render(<ProjectMembersList projectId="project-1" />);

    expect(screen.getByText("empty")).toBeInTheDocument();
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

    render(<ProjectMembersList projectId="project-1" />);

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

    render(<ProjectMembersList projectId="project-1" />);
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

    render(<ProjectMembersList projectId="project-1" />);

    expect(screen.getByRole("button", { name: "remove" })).toBeDisabled();
  });
});
