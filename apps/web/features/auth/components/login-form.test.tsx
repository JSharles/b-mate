import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api-client";
import { useLogin } from "../hooks";
import { LoginForm } from "./login-form";

vi.mock("../hooks", () => ({
  useLogin: vi.fn(),
}));

const mockedUseLogin = vi.mocked(useLogin);

function baseMutation() {
  return {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useLogin>;
}

describe("LoginForm", () => {
  beforeEach(() => {
    mockedUseLogin.mockReturnValue(baseMutation());
  });

  it("submits the form values when valid", async () => {
    const mutation = baseMutation();
    mockedUseLogin.mockReturnValue(mutation);
    const user = userEvent.setup();

    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "jc@example.com");
    await user.type(screen.getByLabelText("Password"), "supersecret123");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(mutation.mutate).toHaveBeenCalledWith({
      email: "jc@example.com",
      password: "supersecret123",
    });
  });

  it("shows a validation error and does not submit for an invalid email", async () => {
    const mutation = baseMutation();
    mockedUseLogin.mockReturnValue(mutation);
    const user = userEvent.setup();

    render(<LoginForm />);
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Password"), "supersecret123");
    await user.click(screen.getByRole("button", { name: "Log in" }));

    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it("shows the API error message inline when the mutation fails", () => {
    mockedUseLogin.mockReturnValue({
      ...baseMutation(),
      isError: true,
      error: new ApiError("Invalid credentials", 401),
    } as unknown as ReturnType<typeof useLogin>);

    render(<LoginForm />);

    expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
  });

  it("disables the submit button while pending", () => {
    mockedUseLogin.mockReturnValue({
      ...baseMutation(),
      isPending: true,
    } as unknown as ReturnType<typeof useLogin>);

    render(<LoginForm />);

    expect(screen.getByRole("button", { name: "Logging in…" })).toBeDisabled();
  });
});
