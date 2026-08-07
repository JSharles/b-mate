import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import type { User } from "schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLogout } from "@/features/auth/hooks";
import { TopNav } from "./top-nav";

vi.mock("@/features/auth/hooks", () => ({
  useLogout: vi.fn(),
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

// Radix's real AvatarImage only renders once the image has actually loaded
// (an event jsdom never fires), so it's swapped for a plain <img> here —
// same reasoning as everywhere else in this suite that mocks a library
// component to test *wiring* (which src gets passed), not its own behavior.
vi.mock("@/shared/components/ui/avatar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/components/ui/avatar")>();
  return {
    ...actual,
    AvatarImage: ({ alt = "", ...props }: { src?: string; alt?: string }) => (
      // eslint-disable-next-line @next/next/no-img-element -- test double, not real app UI
      <img data-testid="avatar-image" alt={alt} {...props} />
    ),
  };
});

const mockedUseLogout = vi.mocked(useLogout);

const fakeUser = {
  id: "1",
  firstName: "Jean",
  lastName: "Charles",
  email: "jc@example.com",
  image: null,
} as User;

describe("TopNav", () => {
  beforeEach(() => {
    mockedUseLogout.mockReturnValue({ mutate: vi.fn() } as unknown as ReturnType<
      typeof useLogout
    >);
  });

  it("shows the brand mark, the user's initials and full name", () => {
    render(<TopNav user={fakeUser} />);

    expect(screen.getByText("Diaphane")).toBeInTheDocument();
    expect(screen.getByText("JC")).toBeInTheDocument();
    expect(screen.getByText("Jean Charles")).toBeInTheDocument();
  });

  it("does not render an avatar image when the user has none", () => {
    render(<TopNav user={fakeUser} />);

    expect(screen.queryByTestId("avatar-image")).not.toBeInTheDocument();
  });

  it("shows the user's profile picture when they have one (e.g. a GitHub avatar)", () => {
    const withImage = { ...fakeUser, image: "https://example.com/avatar.png" } as User;

    render(<TopNav user={withImage} />);

    expect(screen.getByTestId("avatar-image")).toHaveAttribute(
      "src",
      "https://example.com/avatar.png",
    );
  });

  it("links to the profile page from the user menu", async () => {
    const user = userEvent.setup();
    render(<TopNav user={fakeUser} />);

    await user.click(screen.getByText("Jean Charles"));

    expect(await screen.findByText("profile")).toHaveAttribute("href", "/profile");
  });

  it("calls logout.mutate when logout is selected", async () => {
    const mutate = vi.fn();
    mockedUseLogout.mockReturnValue({ mutate } as unknown as ReturnType<typeof useLogout>);
    const user = userEvent.setup();

    render(<TopNav user={fakeUser} />);

    await user.click(screen.getByText("Jean Charles"));
    await user.click(await screen.findByText("logout"));

    expect(mutate).toHaveBeenCalled();
  });
});
