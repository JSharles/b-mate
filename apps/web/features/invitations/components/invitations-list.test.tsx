import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useInvitations } from "../hooks";
import { InvitationsList } from "./invitations-list";

vi.mock("../hooks", () => ({
  useInvitations: vi.fn(),
}));

const mockedUseInvitations = vi.mocked(useInvitations);

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}

describe("InvitationsList", () => {
  it("shows an empty message when there are no invitations", () => {
    mockedUseInvitations.mockReturnValue({
      data: [],
      isPending: false,
    } as unknown as ReturnType<typeof useInvitations>);

    render(<InvitationsList projectId="project-1" />);

    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  it("lists each invitation's email with a copy-link button", async () => {
    mockedUseInvitations.mockReturnValue({
      data: [{ id: "1", email: "client@example.com", token: "the-token" }],
      isPending: false,
    } as unknown as ReturnType<typeof useInvitations>);
    const user = userEvent.setup();
    const writeText = stubClipboard();

    render(<InvitationsList projectId="project-1" />);
    expect(screen.getByText("client@example.com")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "copyLink" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("http://localhost:3000/invite/the-token"),
    );
    await waitFor(() => expect(screen.getByText("copied")).toBeInTheDocument());
  });
});
