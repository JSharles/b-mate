import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api-client";
import { useAcceptInvitation } from "../hooks";
import { AcceptInvitationForm } from "./accept-invitation-form";

vi.mock("../hooks", () => ({
  useAcceptInvitation: vi.fn(),
}));

const mockedUseAcceptInvitation = vi.mocked(useAcceptInvitation);

function baseMutation() {
  return {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useAcceptInvitation>;
}

describe("AcceptInvitationForm", () => {
  beforeEach(() => {
    mockedUseAcceptInvitation.mockReturnValue(baseMutation());
  });

  it("shows the read-only invited email", () => {
    render(<AcceptInvitationForm token="the-token" email="client@example.com" accountExists={false} />);

    expect(screen.getByText("client@example.com")).toBeInTheDocument();
  });

  describe("when the account does not exist yet", () => {
    it("shows firstName/lastName fields and the create-account button label", async () => {
      const mutation = baseMutation();
      mockedUseAcceptInvitation.mockReturnValue(mutation);
      const user = userEvent.setup();

      render(
        <AcceptInvitationForm token="the-token" email="client@example.com" accountExists={false} />,
      );
      await user.type(screen.getByLabelText("firstName"), "Jean");
      await user.type(screen.getByLabelText("lastName"), "Charles");
      await user.type(screen.getByLabelText("password"), "supersecret123");
      await user.click(screen.getByRole("button", { name: "createAccount" }));

      expect(mutation.mutate).toHaveBeenCalledWith({
        firstName: "Jean",
        lastName: "Charles",
        password: "supersecret123",
      });
    });

    it("does not submit when firstName is missing", async () => {
      const mutation = baseMutation();
      mockedUseAcceptInvitation.mockReturnValue(mutation);
      const user = userEvent.setup();

      render(
        <AcceptInvitationForm token="the-token" email="client@example.com" accountExists={false} />,
      );
      await user.type(screen.getByLabelText("password"), "supersecret123");
      await user.click(screen.getByRole("button", { name: "createAccount" }));

      expect(mutation.mutate).not.toHaveBeenCalled();
    });
  });

  describe("when the account already exists", () => {
    it("hides firstName/lastName and shows the log in button label", async () => {
      const mutation = baseMutation();
      mockedUseAcceptInvitation.mockReturnValue(mutation);
      const user = userEvent.setup();

      render(
        <AcceptInvitationForm token="the-token" email="client@example.com" accountExists={true} />,
      );

      expect(screen.queryByLabelText("firstName")).not.toBeInTheDocument();
      await user.type(screen.getByLabelText("password"), "whatever");
      await user.click(screen.getByRole("button", { name: "logIn" }));

      expect(mutation.mutate).toHaveBeenCalledWith({ password: "whatever" });
    });
  });

  it("shows the API error message inline when the mutation fails", () => {
    mockedUseAcceptInvitation.mockReturnValue({
      ...baseMutation(),
      isError: true,
      error: new ApiError("Invalid credentials", 401),
    } as unknown as ReturnType<typeof useAcceptInvitation>);

    render(
      <AcceptInvitationForm token="the-token" email="client@example.com" accountExists={true} />,
    );

    expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
  });

  it("disables the submit button while pending", () => {
    mockedUseAcceptInvitation.mockReturnValue({
      ...baseMutation(),
      isPending: true,
    } as unknown as ReturnType<typeof useAcceptInvitation>);

    render(
      <AcceptInvitationForm token="the-token" email="client@example.com" accountExists={true} />,
    );

    expect(screen.getByRole("button", { name: "submitPending" })).toBeDisabled();
  });
});
