import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useCancelInvitation, useInvitations, useResendInvitation } from "../hooks";
import { InvitationsList } from "./invitations-list";

vi.mock("../hooks", () => ({
  useInvitations: vi.fn(),
  useCancelInvitation: vi.fn(),
  useResendInvitation: vi.fn(),
}));

const mockedUseInvitations = vi.mocked(useInvitations);
const mockedUseCancelInvitation = vi.mocked(useCancelInvitation);
const mockedUseResendInvitation = vi.mocked(useResendInvitation);

function stubMutations() {
  const cancelMutate = vi.fn();
  const resendMutate = vi.fn();
  mockedUseCancelInvitation.mockReturnValue({
    mutate: cancelMutate,
    isPending: false,
    variables: undefined,
  } as unknown as ReturnType<typeof useCancelInvitation>);
  mockedUseResendInvitation.mockReturnValue({
    mutate: resendMutate,
    isPending: false,
    variables: undefined,
  } as unknown as ReturnType<typeof useResendInvitation>);
  return { cancelMutate, resendMutate };
}

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
    stubMutations();

    render(<InvitationsList projectId="project-1" />);

    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  it("lists each invitation's email with a copy-link button", async () => {
    mockedUseInvitations.mockReturnValue({
      data: [{ id: "1", email: "client@example.com", token: "the-token" }],
      isPending: false,
    } as unknown as ReturnType<typeof useInvitations>);
    stubMutations();
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

  it("cancels an invitation when the cancel action is clicked", async () => {
    mockedUseInvitations.mockReturnValue({
      data: [{ id: "1", email: "client@example.com", token: "the-token" }],
      isPending: false,
    } as unknown as ReturnType<typeof useInvitations>);
    const { cancelMutate } = stubMutations();
    const user = userEvent.setup();

    render(<InvitationsList projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "cancel" }));

    expect(cancelMutate).toHaveBeenCalledWith("1");
  });

  it("resends an invitation when the resend action is clicked", async () => {
    mockedUseInvitations.mockReturnValue({
      data: [{ id: "1", email: "client@example.com", token: "the-token" }],
      isPending: false,
    } as unknown as ReturnType<typeof useInvitations>);
    const { resendMutate } = stubMutations();
    const user = userEvent.setup();

    render(<InvitationsList projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "resend" }));

    expect(resendMutate).toHaveBeenCalledWith("1");
  });
});
