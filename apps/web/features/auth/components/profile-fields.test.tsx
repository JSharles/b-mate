import { render, screen } from "@testing-library/react";
import type { User } from "schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUpdateProfile } from "../hooks";
import { ProfileFields } from "./profile-fields";

vi.mock("../hooks", () => ({
  useUpdateProfile: vi.fn(),
}));

const mockedUseUpdateProfile = vi.mocked(useUpdateProfile);

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

describe("ProfileFields", () => {
  beforeEach(() => {
    mockedUseUpdateProfile.mockReturnValue({
      mutate: vi.fn(),
      reset: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
    } as unknown as ReturnType<typeof useUpdateProfile>);
  });

  it("shows every field, including GitHub and Malt, for a developer account", () => {
    render(<ProfileFields user={fakeUser({ accountKind: "developer" })} />);

    expect(screen.getByText("roleTitle")).toBeInTheDocument();
    expect(screen.getByText("phone")).toBeInTheDocument();
    expect(screen.getByText("github")).toBeInTheDocument();
    expect(screen.getByText("linkedin")).toBeInTheDocument();
    expect(screen.getByText("malt")).toBeInTheDocument();
    expect(screen.getByText("website")).toBeInTheDocument();
  });

  it("hides GitHub and Malt for a client account — meaningless for a non-developer", () => {
    render(<ProfileFields user={fakeUser({ accountKind: "client" })} />);

    expect(screen.getByText("roleTitle")).toBeInTheDocument();
    expect(screen.getByText("phone")).toBeInTheDocument();
    expect(screen.getByText("linkedin")).toBeInTheDocument();
    expect(screen.getByText("website")).toBeInTheDocument();
    expect(screen.queryByText("github")).not.toBeInTheDocument();
    expect(screen.queryByText("malt")).not.toBeInTheDocument();
  });

  it("shows each field's current value", () => {
    render(
      <ProfileFields
        user={fakeUser({ roleTitle: "Lead developer", phone: "0600000000" })}
      />,
    );

    expect(screen.getByText("Lead developer")).toBeInTheDocument();
    expect(screen.getByText("0600000000")).toBeInTheDocument();
  });
});
