import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useProjects } from "../hooks";
import { ProjectList } from "./project-list";

vi.mock("../hooks", () => ({
  useProjects: vi.fn(),
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

const mockedUseProjects = vi.mocked(useProjects);

describe("ProjectList", () => {
  it("shows an empty state with a create link when there are no projects", () => {
    mockedUseProjects.mockReturnValue({
      data: [],
      isPending: false,
    } as unknown as ReturnType<typeof useProjects>);

    render(<ProjectList />);

    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "emptyCta" })).toHaveAttribute(
      "href",
      "/projects/new",
    );
  });

  it("renders a card per project when the list is populated", () => {
    mockedUseProjects.mockReturnValue({
      data: [
        { id: "1", title: "Site vitrine client X" },
        { id: "2", title: "App mobile client Y" },
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useProjects>);

    render(<ProjectList />);

    expect(screen.getByText("Site vitrine client X")).toBeInTheDocument();
    expect(screen.getByText("App mobile client Y")).toBeInTheDocument();
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });

  it("shows loading skeletons while pending", () => {
    mockedUseProjects.mockReturnValue({
      data: undefined,
      isPending: true,
    } as unknown as ReturnType<typeof useProjects>);

    render(<ProjectList />);

    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });

  it("always renders the header with a new project link", () => {
    mockedUseProjects.mockReturnValue({
      data: [],
      isPending: false,
    } as unknown as ReturnType<typeof useProjects>);

    render(<ProjectList />);

    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "newProject" })).toHaveAttribute(
      "href",
      "/projects/new",
    );
  });
});
