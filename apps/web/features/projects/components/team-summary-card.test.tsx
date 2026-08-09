import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useProjectMembers } from "../hooks";
import { TeamSummaryCard } from "./team-summary-card";

vi.mock("../hooks", () => ({
  useProjectMembers: vi.fn(),
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

const mockedUseProjectMembers = vi.mocked(useProjectMembers);

function member(userId: string, firstName: string, lastName: string) {
  return {
    userId,
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}@example.com`,
    isAdmin: false,
    image: null,
  };
}

describe("TeamSummaryCard", () => {
  it("shows a skeleton while pending", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: undefined,
      isPending: true,
    } as unknown as ReturnType<typeof useProjectMembers>);

    const { container } = render(<TeamSummaryCard projectId="project-1" isAdmin={true} />);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("shows an empty message when there are no members", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);

    render(<TeamSummaryCard projectId="project-1" isAdmin={true} />);

    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  it("shows an avatar per member, with no overflow bubble under the threshold", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [member("1", "Jean", "Charles"), member("2", "Ada", "Lovelace")],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);

    const { container } = render(<TeamSummaryCard projectId="project-1" isAdmin={true} />);

    expect(container.querySelectorAll('[data-slot="avatar"]')).toHaveLength(2);
    expect(container.querySelector('[data-slot="avatar-group-count"]')).not.toBeInTheDocument();
  });

  it("caps visible avatars at 4 and shows a +N overflow bubble beyond that", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [
        member("1", "Jean", "Charles"),
        member("2", "Ada", "Lovelace"),
        member("3", "Grace", "Hopper"),
        member("4", "Alan", "Turing"),
        member("5", "Margaret", "Hamilton"),
        member("6", "Katherine", "Johnson"),
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);

    const { container } = render(<TeamSummaryCard projectId="project-1" isAdmin={true} />);

    expect(container.querySelectorAll('[data-slot="avatar"]')).toHaveLength(4);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("links to the dedicated team page, labeled 'Manage' for an admin viewer", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [member("1", "Jean", "Charles")],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);

    render(<TeamSummaryCard projectId="project-1" isAdmin={true} />);

    expect(screen.getByRole("link", { name: "manage" })).toHaveAttribute(
      "href",
      "/projects/project-1/team",
    );
  });

  it("labels the same link 'View' for a non-admin viewer, who only gets a read-only roster on that page", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [member("1", "Jean", "Charles")],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);

    render(<TeamSummaryCard projectId="project-1" isAdmin={false} />);

    expect(screen.getByRole("link", { name: "view" })).toHaveAttribute(
      "href",
      "/projects/project-1/team",
    );
    expect(screen.queryByRole("link", { name: "manage" })).not.toBeInTheDocument();
  });
});
