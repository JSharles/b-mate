import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useProjectMembers } from "../hooks";
import { TeamPanel } from "./team-panel";

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

function member(
  userId: string,
  firstName: string,
  lastName: string,
  overrides: Partial<{
    role: "client" | "contributor";
    phone: string | null;
    github: string | null;
    linkedin: string | null;
    malt: string | null;
    website: string | null;
  }> = {},
) {
  return {
    userId,
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}@example.com`,
    isAdmin: false,
    role: "client" as const,
    image: null,
    roleTitle: null,
    phone: null,
    github: null,
    linkedin: null,
    malt: null,
    website: null,
    ...overrides,
  };
}

describe("TeamPanel", () => {
  it("shows skeletons while pending", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: undefined,
      isPending: true,
    } as unknown as ReturnType<typeof useProjectMembers>);

    const { container } = render(<TeamPanel projectId="project-1" isAdmin={true} />);

    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it("shows an empty message when there is no contributor", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [member("1", "Ada", "Lovelace", { role: "client" })],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);

    render(<TeamPanel projectId="project-1" isAdmin={true} />);

    expect(screen.getByText("developerEmpty")).toBeInTheDocument();
  });

  it("shows the contributor as the developer, with every contact detail present", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [
        member("1", "Jean", "Charles", {
          role: "contributor",
          phone: "0600000000",
          github: "jc",
          linkedin: "in/jean-charles",
          malt: "malt.fr/jc",
          website: "jeancharles.dev",
        }),
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);

    render(<TeamPanel projectId="project-1" isAdmin={true} />);

    expect(screen.getByText("Jean Charles")).toBeInTheDocument();
    expect(screen.getByText("jean@example.com")).toBeInTheDocument();
    expect(screen.getByText("0600000000")).toBeInTheDocument();
    expect(screen.getByText("jc")).toBeInTheDocument();
    expect(screen.getByText("in/jean-charles")).toBeInTheDocument();
    expect(screen.getByText("malt.fr/jc")).toBeInTheDocument();
    expect(screen.getByText("jeancharles.dev")).toBeInTheDocument();
  });

  it("makes every contact detail a clickable link that opens in a new tab", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [
        member("1", "Jean", "Charles", {
          role: "contributor",
          phone: "0600000000",
          github: "github.com/jc",
          linkedin: "linkedin.com/in/jean-charles",
          malt: "malt.fr/jc",
          website: "jeancharles.dev",
        }),
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);

    render(<TeamPanel projectId="project-1" isAdmin={true} />);

    expect(screen.getByRole("link", { name: /jean@example\.com/ })).toHaveAttribute(
      "href",
      "mailto:jean@example.com",
    );
    expect(screen.getByRole("link", { name: /0600000000/ })).toHaveAttribute(
      "href",
      "tel:0600000000",
    );
    expect(screen.getByRole("link", { name: /github\.com\/jc/ })).toHaveAttribute(
      "href",
      "https://github.com/jc",
    );
    const socialLink = screen.getByRole("link", { name: /linkedin\.com\/in\/jean-charles/ });
    expect(socialLink).toHaveAttribute("href", "https://linkedin.com/in/jean-charles");
    expect(socialLink).toHaveAttribute("target", "_blank");
  });

  it("prepends https:// to a social/website value that has no scheme", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [member("1", "Jean", "Charles", { role: "contributor", website: "jeancharles.dev" })],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);

    render(<TeamPanel projectId="project-1" isAdmin={true} />);

    expect(screen.getByRole("link", { name: /jeancharles\.dev/ })).toHaveAttribute(
      "href",
      "https://jeancharles.dev",
    );
  });

  it("only renders contact rows for fields that are actually set", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [member("1", "Jean", "Charles", { role: "contributor" })],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);

    render(<TeamPanel projectId="project-1" isAdmin={true} />);

    // Only email has a value in this fixture — phone/github/linkedin/malt/
    // website are all null and must not render an icon with no text next
    // to it.
    expect(screen.getByText("jean@example.com")).toBeInTheDocument();
    expect(screen.queryByText("null")).not.toBeInTheDocument();
  });

  it("shows the developer's roleTitle when set, falling back to a generic label otherwise", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [member("1", "Jean", "Charles", { role: "contributor" })],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);

    render(<TeamPanel projectId="project-1" isAdmin={true} />);

    expect(screen.getByText("roleFallback")).toBeInTheDocument();
  });

  it("shows an avatar per member in the team section, plus the developer's own avatar", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [
        member("1", "Jean", "Charles", { role: "contributor" }),
        member("2", "Ada", "Lovelace"),
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);

    const { container } = render(<TeamPanel projectId="project-1" isAdmin={true} />);

    // 2 members in the AvatarGroup + 1 for the developer highlighted above it
    expect(container.querySelectorAll('[data-slot="avatar"]')).toHaveLength(3);
  });

  it("links to the dedicated team page, labeled 'Manage' for an admin viewer", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [member("1", "Jean", "Charles", { role: "contributor" })],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);

    render(<TeamPanel projectId="project-1" isAdmin={true} />);

    expect(screen.getByRole("link", { name: "manage" })).toHaveAttribute(
      "href",
      "/projects/project-1/team",
    );
  });

  it("labels the same link 'View' for a non-admin viewer", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [member("1", "Jean", "Charles", { role: "contributor" })],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);

    render(<TeamPanel projectId="project-1" isAdmin={false} />);

    expect(screen.getByRole("link", { name: "view" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "manage" })).not.toBeInTheDocument();
  });
});
