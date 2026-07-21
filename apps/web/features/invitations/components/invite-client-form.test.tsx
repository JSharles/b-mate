import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api-client";
import { useCreateInvitation } from "../hooks";
import { InviteClientForm } from "./invite-client-form";

vi.mock("../hooks", () => ({
  useCreateInvitation: vi.fn(),
}));

const mockedUseCreateInvitation = vi.mocked(useCreateInvitation);

function baseMutation() {
  return {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useCreateInvitation>;
}

describe("InviteClientForm", () => {
  beforeEach(() => {
    mockedUseCreateInvitation.mockReturnValue(baseMutation());
  });

  it("submits the email when valid", async () => {
    const mutation = baseMutation();
    mockedUseCreateInvitation.mockReturnValue(mutation);
    const user = userEvent.setup();

    render(<InviteClientForm projectId="project-1" />);
    await user.type(screen.getByLabelText("email"), "client@example.com");
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mutation.mutate).toHaveBeenCalledWith(
      { email: "client@example.com" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("does not submit for an invalid email", async () => {
    const mutation = baseMutation();
    mockedUseCreateInvitation.mockReturnValue(mutation);
    const user = userEvent.setup();

    render(<InviteClientForm projectId="project-1" />);
    await user.type(screen.getByLabelText("email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it("shows the API error message inline when the mutation fails", () => {
    mockedUseCreateInvitation.mockReturnValue({
      ...baseMutation(),
      isError: true,
      error: new ApiError("Only a project admin can manage invitations", 403),
    } as unknown as ReturnType<typeof useCreateInvitation>);

    render(<InviteClientForm projectId="project-1" />);

    expect(screen.getByText("Only a project admin can manage invitations")).toBeInTheDocument();
  });

  it("shows the already-a-member error distinctly (FR-022)", () => {
    mockedUseCreateInvitation.mockReturnValue({
      ...baseMutation(),
      isError: true,
      error: new ApiError("This person is already a member of the project", 409),
    } as unknown as ReturnType<typeof useCreateInvitation>);

    render(<InviteClientForm projectId="project-1" />);

    expect(
      screen.getByText("This person is already a member of the project"),
    ).toBeInTheDocument();
  });

  it("disables the submit button while pending", () => {
    mockedUseCreateInvitation.mockReturnValue({
      ...baseMutation(),
      isPending: true,
    } as unknown as ReturnType<typeof useCreateInvitation>);

    render(<InviteClientForm projectId="project-1" />);

    expect(screen.getByRole("button", { name: "submitPending" })).toBeDisabled();
  });
});
