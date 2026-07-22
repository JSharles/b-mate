import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

vi.mock("./create-project-dialog", () => ({
  CreateProjectDialog: vi.fn(({ open }: { open: boolean }) => (
    <div data-testid="create-project-dialog">{open ? "open" : "closed"}</div>
  )),
}));

const mockedUseProjects = vi.mocked(useProjects);

describe("ProjectList", () => {
  it("shows an empty state whose create button opens the create-project dialog", async () => {
    mockedUseProjects.mockReturnValue({
      data: [],
      isPending: false,
    } as unknown as ReturnType<typeof useProjects>);
    const user = userEvent.setup();

    render(<ProjectList />);

    expect(screen.getByText("emptyTitle")).toBeInTheDocument();
    expect(screen.getByTestId("create-project-dialog")).toHaveTextContent("closed");

    await user.click(screen.getByRole("button", { name: "emptyCta" }));

    expect(screen.getByTestId("create-project-dialog")).toHaveTextContent("open");
  });

  it("renders a card per project when the list is populated", () => {
    mockedUseProjects.mockReturnValue({
      data: [
        {
          id: "1",
          title: "Site vitrine client X",
          status: null,
          progressPercentage: null,
          createdAt: "2026-01-15T00:00:00.000Z",
        },
        {
          id: "2",
          title: "App mobile client Y",
          status: null,
          progressPercentage: null,
          createdAt: "2026-02-01T00:00:00.000Z",
        },
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useProjects>);

    render(<ProjectList />);

    expect(screen.getByText("Site vitrine client X")).toBeInTheDocument();
    expect(screen.getByText("App mobile client Y")).toBeInTheDocument();
    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Site vitrine client X/ })).toHaveAttribute(
      "href",
      "/projects/1",
    );
  });

  it("shows the creation date, and the status/progress only when present", () => {
    mockedUseProjects.mockReturnValue({
      data: [
        {
          id: "1",
          title: "Site vitrine client X",
          status: null,
          progressPercentage: null,
          createdAt: "2026-01-15T00:00:00.000Z",
        },
        {
          id: "2",
          title: "App mobile client Y",
          status: "En cours",
          progressPercentage: 42,
          createdAt: "2026-02-01T00:00:00.000Z",
        },
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useProjects>);

    render(<ProjectList />);

    expect(screen.getAllByText("createdAt")).toHaveLength(2);
    expect(screen.queryByText("En cours")).toBeInTheDocument();
    expect(screen.getByText("42%")).toBeInTheDocument();
  });

  it("shows loading skeletons while pending", () => {
    mockedUseProjects.mockReturnValue({
      data: undefined,
      isPending: true,
    } as unknown as ReturnType<typeof useProjects>);

    render(<ProjectList />);

    expect(screen.queryByText("emptyTitle")).not.toBeInTheDocument();
  });

  it("opens the create-project dialog from the header button", async () => {
    mockedUseProjects.mockReturnValue({
      data: [],
      isPending: false,
    } as unknown as ReturnType<typeof useProjects>);
    const user = userEvent.setup();

    render(<ProjectList />);

    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByTestId("create-project-dialog")).toHaveTextContent("closed");

    await user.click(screen.getByRole("button", { name: "newProject" }));

    expect(screen.getByTestId("create-project-dialog")).toHaveTextContent("open");
  });
});
