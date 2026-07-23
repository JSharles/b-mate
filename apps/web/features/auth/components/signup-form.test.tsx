import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api-client";
import { useSignup } from "../hooks";
import { SignupForm } from "./signup-form";

vi.mock("../hooks", () => ({
  useSignup: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
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
  await user.click(screen.getByRole("button", { name: "accountKindDeveloper" }));
  await user.type(screen.getByLabelText("firstName"), "Jean");
  await user.type(screen.getByLabelText("lastName"), "Charles");
  await user.type(screen.getByLabelText("email"), "jc@example.com");
  await user.type(screen.getByLabelText("password"), "supersecret123");
  await user.type(screen.getByLabelText("confirmPassword"), "supersecret123");
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
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mutation.mutate).toHaveBeenCalledWith({
      firstName: "Jean",
      lastName: "Charles",
      email: "jc@example.com",
      password: "supersecret123",
      accountKind: "developer",
    });
  });

  it("submits with a client accountKind when that option is chosen", async () => {
    const mutation = baseMutation();
    mockedUseSignup.mockReturnValue(mutation);
    const user = userEvent.setup();

    render(<SignupForm />);
    await user.click(screen.getByRole("button", { name: "accountKindClient" }));
    await user.type(screen.getByLabelText("firstName"), "Jean");
    await user.type(screen.getByLabelText("lastName"), "Charles");
    await user.type(screen.getByLabelText("email"), "jc@example.com");
    await user.type(screen.getByLabelText("password"), "supersecret123");
    await user.type(screen.getByLabelText("confirmPassword"), "supersecret123");
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mutation.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ accountKind: "client" }),
    );
  });

  it("blocks submission when no account kind is chosen", async () => {
    const mutation = baseMutation();
    mockedUseSignup.mockReturnValue(mutation);
    const user = userEvent.setup();

    render(<SignupForm />);
    await user.type(screen.getByLabelText("firstName"), "Jean");
    await user.type(screen.getByLabelText("lastName"), "Charles");
    await user.type(screen.getByLabelText("email"), "jc@example.com");
    await user.type(screen.getByLabelText("password"), "supersecret123");
    await user.type(screen.getByLabelText("confirmPassword"), "supersecret123");
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mutation.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("accountKindRequired")).toBeInTheDocument();
  });

  it("blocks submission when passwords don't match", async () => {
    const mutation = baseMutation();
    mockedUseSignup.mockReturnValue(mutation);
    const user = userEvent.setup();

    render(<SignupForm />);
    await user.click(screen.getByRole("button", { name: "accountKindDeveloper" }));
    await user.type(screen.getByLabelText("firstName"), "Jean");
    await user.type(screen.getByLabelText("lastName"), "Charles");
    await user.type(screen.getByLabelText("email"), "jc@example.com");
    await user.type(screen.getByLabelText("password"), "supersecret123");
    await user.type(screen.getByLabelText("confirmPassword"), "different123");
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mutation.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("passwordsDontMatch")).toBeInTheDocument();
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
