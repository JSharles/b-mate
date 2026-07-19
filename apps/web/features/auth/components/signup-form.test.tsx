import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api-client";
import { useSignup } from "../hooks";
import { SignupForm } from "./signup-form";

vi.mock("../hooks", () => ({
  useSignup: vi.fn(),
}));

const mockedUseSignup = vi.mocked(useSignup);

function baseMutation() {
  return {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useSignup>;
}

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("First name"), "Jean");
  await user.type(screen.getByLabelText("Last name"), "Charles");
  await user.type(screen.getByLabelText("Email"), "jc@example.com");
  await user.type(screen.getByLabelText("Password"), "supersecret123");
  await user.type(screen.getByLabelText("Confirm password"), "supersecret123");
}

describe("SignupForm", () => {
  beforeEach(() => {
    mockedUseSignup.mockReturnValue(baseMutation());
  });

  it("submits without confirmPassword when the form is valid", async () => {
    const mutation = baseMutation();
    mockedUseSignup.mockReturnValue(mutation);
    const user = userEvent.setup();

    render(<SignupForm />);
    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(mutation.mutate).toHaveBeenCalledWith({
      firstName: "Jean",
      lastName: "Charles",
      email: "jc@example.com",
      password: "supersecret123",
    });
  });

  it("blocks submission when passwords don't match", async () => {
    const mutation = baseMutation();
    mockedUseSignup.mockReturnValue(mutation);
    const user = userEvent.setup();

    render(<SignupForm />);
    await user.type(screen.getByLabelText("First name"), "Jean");
    await user.type(screen.getByLabelText("Last name"), "Charles");
    await user.type(screen.getByLabelText("Email"), "jc@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret123");
    await user.type(screen.getByLabelText("Confirm password"), "different123");
    await user.click(screen.getByRole("button", { name: "Sign up" }));

    expect(mutation.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Passwords don't match")).toBeInTheDocument();
  });

  it("shows the API error message inline when the mutation fails", () => {
    mockedUseSignup.mockReturnValue({
      ...baseMutation(),
      isError: true,
      error: new ApiError("An account with this email already exists", 409),
    } as unknown as ReturnType<typeof useSignup>);

    render(<SignupForm />);

    expect(
      screen.getByText("An account with this email already exists"),
    ).toBeInTheDocument();
  });
});
