import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api-client";
import { useProjectMembers, useRemoveMember } from "../hooks";
import { ProjectMembersList } from "./project-members-list";

vi.mock("../hooks", () => ({
  useProjectMembers: vi.fn(),
  useRemoveMember: vi.fn(),
}));

const mockedUseProjectMembers = vi.mocked(useProjectMembers);
const mockedUseRemoveMember = vi.mocked(useRemoveMember);

function stubRemoveMember(overrides: Record<string, unknown> = {}) {
  const mutate = vi.fn();
  const reset = vi.fn();
  mockedUseRemoveMember.mockReturnValue({
    mutate,
    reset,
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
    ...overrides,
  } as unknown as ReturnType<typeof useRemoveMember>);
  return mutate;
}

const twoMembers = [
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
];

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
      data: twoMembers,
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);
    stubRemoveMember();

    render(<ProjectMembersList projectId="project-1" canManageMembers={true} />);

    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "remove" })).toHaveLength(2);
  });

  it("asks for confirmation before removing, naming the member, and does not remove on its own", async () => {
    mockedUseProjectMembers.mockReturnValue({
      data: twoMembers,
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);
    const mutate = stubRemoveMember();
    const user = userEvent.setup();

    render(<ProjectMembersList projectId="project-1" canManageMembers={true} />);
    await user.click(screen.getAllByRole("button", { name: "remove" })[1]);

    expect(screen.getByText("removeConfirmTitle")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("removes a member only after confirming in the alert dialog", async () => {
    mockedUseProjectMembers.mockReturnValue({
      data: twoMembers,
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);
    const mutate = stubRemoveMember();
    const user = userEvent.setup();

    render(<ProjectMembersList projectId="project-1" canManageMembers={true} />);
    await user.click(screen.getAllByRole("button", { name: "remove" })[1]);
    await user.click(screen.getByRole("button", { name: "removeConfirmAction" }));

    expect(mutate).toHaveBeenCalledWith("user-2", expect.objectContaining({ onSuccess: expect.any(Function) }));
  });

  it("closes the confirmation dialog only once the remove mutation succeeds", async () => {
    mockedUseProjectMembers.mockReturnValue({
      data: twoMembers,
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);
    stubRemoveMember({
      mutate: vi.fn((_userId: string, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.()),
    });
    const user = userEvent.setup();

    render(<ProjectMembersList projectId="project-1" canManageMembers={true} />);
    await user.click(screen.getAllByRole("button", { name: "remove" })[1]);
    expect(screen.getByText("removeConfirmTitle")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "removeConfirmAction" }));

    expect(screen.queryByText("removeConfirmTitle")).not.toBeInTheDocument();
  });

  it("keeps the confirmation open and shows the error when the remove mutation fails", async () => {
    mockedUseProjectMembers.mockReturnValue({
      data: twoMembers,
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);
    stubRemoveMember({ isError: true, error: new ApiError("Could not remove this member", 500) });
    const user = userEvent.setup();

    render(<ProjectMembersList projectId="project-1" canManageMembers={true} />);
    await user.click(screen.getAllByRole("button", { name: "remove" })[1]);

    expect(screen.getByText("removeConfirmTitle")).toBeInTheDocument();
    expect(screen.getByText("Could not remove this member")).toBeInTheDocument();
  });

  it("does not remove the member when the confirmation is cancelled", async () => {
    mockedUseProjectMembers.mockReturnValue({
      data: twoMembers,
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);
    const mutate = stubRemoveMember();
    const user = userEvent.setup();

    render(<ProjectMembersList projectId="project-1" canManageMembers={true} />);
    await user.click(screen.getAllByRole("button", { name: "remove" })[1]);
    await user.click(screen.getByRole("button", { name: "removeConfirmCancel" }));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.queryByText("removeConfirmTitle")).not.toBeInTheDocument();
  });

  it("disables Cancel and blocks Escape while the remove mutation is pending, so a running request always has somewhere to report to", async () => {
    mockedUseProjectMembers.mockReturnValue({
      data: twoMembers,
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);
    stubRemoveMember();
    const user = userEvent.setup();

    const { rerender } = render(<ProjectMembersList projectId="project-1" canManageMembers={true} />);
    await user.click(screen.getAllByRole("button", { name: "remove" })[1]);
    expect(screen.getByText("removeConfirmTitle")).toBeInTheDocument();

    stubRemoveMember({ isPending: true });
    rerender(<ProjectMembersList projectId="project-1" canManageMembers={true} />);

    expect(screen.getByRole("button", { name: "removeConfirmCancel" })).toBeDisabled();

    await user.keyboard("{Escape}");

    expect(screen.getByText("removeConfirmTitle")).toBeInTheDocument();
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
