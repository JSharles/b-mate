import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useInvitations } from "../hooks";
import { InvitationsCard } from "./invitations-card";

vi.mock("../hooks", () => ({
  useInvitations: vi.fn(),
}));

vi.mock("./invite-client-dialog", () => ({
  InviteClientDialog: vi.fn(({ open }: { open: boolean }) => (
    <div data-testid="invite-client-dialog">{open ? "open" : "closed"}</div>
  )),
}));

const mockedUseInvitations = vi.mocked(useInvitations);

describe("InvitationsCard", () => {
  it("shows the pending invitations count", () => {
    mockedUseInvitations.mockReturnValue({
      data: [{ id: "1" }, { id: "2" }],
      isPending: false,
    } as unknown as ReturnType<typeof useInvitations>);

    render(<InvitationsCard projectId="project-1" />);

    expect(screen.getByText("pendingCount")).toBeInTheDocument();
  });

  it("shows a skeleton instead of the count while pending", () => {
    mockedUseInvitations.mockReturnValue({
      data: undefined,
      isPending: true,
    } as unknown as ReturnType<typeof useInvitations>);

    const { container } = render(<InvitationsCard projectId="project-1" />);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(screen.queryByText("pendingCount")).not.toBeInTheDocument();
  });

  it("opens the invite dialog when the invite button is clicked", async () => {
    mockedUseInvitations.mockReturnValue({
      data: [],
      isPending: false,
    } as unknown as ReturnType<typeof useInvitations>);
    const user = userEvent.setup();

    render(<InvitationsCard projectId="project-1" />);
    expect(screen.getByTestId("invite-client-dialog")).toHaveTextContent("closed");

    await user.click(screen.getByRole("button", { name: "invite" }));

    expect(screen.getByTestId("invite-client-dialog")).toHaveTextContent("open");
  });
});
