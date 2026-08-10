import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WelcomeCard } from "./welcome-card";

const baseUser = {
  id: "1",
  firstName: "Jean",
  lastName: "Charles",
  email: "jc@example.com",
  accountKind: "developer" as const,
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
};

describe("WelcomeCard", () => {
  it("shows a skeleton while pending", () => {
    const { container } = render(<WelcomeCard user={undefined} isPending={true} />);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("shows the welcome text as a plain (non-heading) line, no card/avatar/edit-profile button", () => {
    render(<WelcomeCard user={baseUser} isPending={false} />);

    expect(screen.getByText("welcome")).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
