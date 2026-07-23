import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { WelcomeCard } from "./welcome-card";

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

const baseUser = {
  id: "1",
  firstName: "Jean",
  lastName: "Charles",
  email: "jc@example.com",
  company: null,
  address: null,
  phone: null,
  image: null,
  bio: null,
  github: null,
  socials: null,
  roleTitle: null,
  status: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("WelcomeCard", () => {
  it("shows a skeleton while pending", () => {
    const { container } = render(<WelcomeCard user={undefined} isPending={true} />);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("shows the welcome heading and an edit-profile link to /profile", () => {
    render(<WelcomeCard user={baseUser} isPending={false} />);

    expect(screen.getByRole("heading", { name: "welcome" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "editProfile" })).toHaveAttribute("href", "/profile");
  });

  it("shows initials when there is no profile image", () => {
    render(<WelcomeCard user={baseUser} isPending={false} />);

    expect(screen.getByText("JC")).toBeInTheDocument();
  });

  it("shows the role title and company only when present", () => {
    const { rerender } = render(<WelcomeCard user={baseUser} isPending={false} />);
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();

    rerender(
      <WelcomeCard
        user={{ ...baseUser, roleTitle: "Lead developer", company: "Acme" }}
        isPending={false}
      />,
    );
    expect(screen.getByText("Lead developer · Acme")).toBeInTheDocument();
  });
});
