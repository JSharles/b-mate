import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api-client";
import { useUpdateProfile } from "../hooks";
import { ProfileForm } from "./profile-form";

vi.mock("../hooks", () => ({
  useUpdateProfile: vi.fn(),
}));

const mockedUseUpdateProfile = vi.mocked(useUpdateProfile);

function baseMutation() {
  return {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useUpdateProfile>;
}

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    firstName: "Jean",
    lastName: "Charles",
    email: "jc@example.com",
    accountKind: "developer",
    company: null,
    address: null,
    phone: null,
    image: null,
    bio: null,
    github: null,
    githubId: null,
    socials: null,
    linkedin: null,
    malt: null,
    website: null,
    roleTitle: null,
    status: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("ProfileForm", () => {
  beforeEach(() => {
    mockedUseUpdateProfile.mockReturnValue(baseMutation());
  });

  it("pre-fills every field from the current user", () => {
    render(
      <ProfileForm
        user={fakeUser({
          roleTitle: "Lead developer",
          phone: "0600000000",
          github: "jc",
          linkedin: "in/jc",
          malt: "malt.fr/jc",
          website: "jc.dev",
        })}
      />,
    );

    expect(screen.getByLabelText("roleTitle")).toHaveValue("Lead developer");
    expect(screen.getByLabelText("phone")).toHaveValue("0600000000");
    expect(screen.getByLabelText("github")).toHaveValue("jc");
    expect(screen.getByLabelText("linkedin")).toHaveValue("in/jc");
    expect(screen.getByLabelText("malt")).toHaveValue("malt.fr/jc");
    expect(screen.getByLabelText("website")).toHaveValue("jc.dev");
  });

  it("submits every field, converting an empty value to null", async () => {
    const mutation = baseMutation();
    mockedUseUpdateProfile.mockReturnValue(mutation);
    const user = userEvent.setup();

    render(<ProfileForm user={fakeUser()} />);
    await user.type(screen.getByLabelText("linkedin"), "in/jc");
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mutation.mutate).toHaveBeenCalledWith({
      roleTitle: null,
      phone: null,
      github: null,
      linkedin: "in/jc",
      malt: null,
      website: null,
    });
  });

  it("hides github and malt for a client account — meaningless for a non-developer", () => {
    render(<ProfileForm user={fakeUser({ accountKind: "client" })} />);

    expect(screen.getByLabelText("roleTitle")).toBeInTheDocument();
    expect(screen.getByLabelText("phone")).toBeInTheDocument();
    expect(screen.getByLabelText("linkedin")).toBeInTheDocument();
    expect(screen.getByLabelText("website")).toBeInTheDocument();
    expect(screen.queryByLabelText("github")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("malt")).not.toBeInTheDocument();
  });

  it("only submits the fields a client account actually sees", async () => {
    const mutation = baseMutation();
    mockedUseUpdateProfile.mockReturnValue(mutation);
    const user = userEvent.setup();

    render(<ProfileForm user={fakeUser({ accountKind: "client" })} />);
    await user.type(screen.getByLabelText("linkedin"), "in/jc");
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mutation.mutate).toHaveBeenCalledWith({
      roleTitle: null,
      phone: null,
      linkedin: "in/jc",
      website: null,
    });
  });

  it("shows the mutation's error message when it fails", () => {
    mockedUseUpdateProfile.mockReturnValue({
      ...baseMutation(),
      isError: true,
      error: new ApiError("Something went wrong", 500),
    } as unknown as ReturnType<typeof useUpdateProfile>);

    render(<ProfileForm user={fakeUser()} />);

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});
