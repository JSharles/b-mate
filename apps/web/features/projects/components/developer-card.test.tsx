import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useProjectMembers } from "../hooks";
import { DeveloperCard } from "./developer-card";

vi.mock("../hooks", () => ({
  useProjectMembers: vi.fn(),
}));

const mockedUseProjectMembers = vi.mocked(useProjectMembers);

const contributor = {
  userId: "user-1",
  firstName: "Jean-Charles",
  lastName: "Barq",
  email: "jc@example.com",
  isAdmin: true,
  role: "contributor" as const,
  image: null,
  roleTitle: null,
  phone: null,
  github: null,
};

const client = {
  userId: "user-2",
  firstName: "Client",
  lastName: "One",
  email: "client@example.com",
  isAdmin: false,
  role: "client" as const,
  image: null,
  roleTitle: null,
  phone: null,
};

describe("DeveloperCard", () => {
  it("shows a skeleton while pending", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: undefined,
      isPending: true,
    } as unknown as ReturnType<typeof useProjectMembers>);

    const { container } = render(<DeveloperCard projectId="project-1" />);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("shows the contributor's name, email, and a role fallback when roleTitle is absent", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [client, contributor],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);

    render(<DeveloperCard projectId="project-1" />);

    expect(screen.getByText("Jean-Charles Barq")).toBeInTheDocument();
    expect(screen.getByText("jc@example.com")).toBeInTheDocument();
    expect(screen.getByText("roleFallback")).toBeInTheDocument();
    expect(screen.queryByText("client@example.com")).not.toBeInTheDocument();
  });

  it("shows the roleTitle instead of the fallback when present", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [{ ...contributor, roleTitle: "Lead Developer" }],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);

    render(<DeveloperCard projectId="project-1" />);

    expect(screen.getByText("Lead Developer")).toBeInTheDocument();
  });

  it("shows the phone number only when present", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [{ ...contributor, phone: "+33 6 12 34 56 78" }],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);

    render(<DeveloperCard projectId="project-1" />);

    expect(screen.getByText("+33 6 12 34 56 78")).toBeInTheDocument();
  });

  it("shows the github handle only when present", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [{ ...contributor, github: "jsharles" }],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);

    render(<DeveloperCard projectId="project-1" />);

    expect(screen.getByText("jsharles")).toBeInTheDocument();
  });

  it("shows an empty state when no contributor is found", () => {
    mockedUseProjectMembers.mockReturnValue({
      data: [client],
      isPending: false,
    } as unknown as ReturnType<typeof useProjectMembers>);

    render(<DeveloperCard projectId="project-1" />);

    expect(screen.getByText("empty")).toBeInTheDocument();
  });
});
