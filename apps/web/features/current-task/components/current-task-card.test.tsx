import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCurrentTask } from "../hooks";
import { CurrentTaskCard } from "./current-task-card";

vi.mock("../hooks", () => ({
  useCurrentTask: vi.fn(),
}));

const mockedUseCurrentTask = vi.mocked(useCurrentTask);

describe("CurrentTaskCard", () => {
  it("shows a skeleton while pending", () => {
    mockedUseCurrentTask.mockReturnValue({
      data: undefined,
      isPending: true,
    } as unknown as ReturnType<typeof useCurrentTask>);

    const { container } = render(<CurrentTaskCard projectId="project-1" />);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(screen.queryByText("empty")).not.toBeInTheDocument();
  });

  it("shows the empty state when there is nothing in progress", () => {
    mockedUseCurrentTask.mockReturnValue({
      data: [],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);

    render(<CurrentTaskCard projectId="project-1" />);

    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  it("shows each item's title and description, with no link to GitHub (clients never go there)", () => {
    mockedUseCurrentTask.mockReturnValue({
      data: [
        {
          title: "Fix race condition",
          description: "Details about the fix",
          updatedAt: "2026-07-20T10:00:00.000Z",
        },
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);

    render(<CurrentTaskCard projectId="project-1" />);

    expect(screen.getByText("Fix race condition")).toBeInTheDocument();
    expect(screen.getByText("Details about the fix")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the title with no description when the item has none (e.g. a draft issue)", () => {
    mockedUseCurrentTask.mockReturnValue({
      data: [
        {
          title: "Draft: sketch the new flow",
          description: null,
          updatedAt: "2026-07-20T10:00:00.000Z",
        },
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);

    render(<CurrentTaskCard projectId="project-1" />);

    expect(screen.getByText("Draft: sketch the new flow")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows more than one item when multiple are in progress", () => {
    mockedUseCurrentTask.mockReturnValue({
      data: [
        { title: "Task A", description: null, updatedAt: "2026-07-20T10:00:00.000Z" },
        { title: "Task B", description: null, updatedAt: "2026-07-20T09:00:00.000Z" },
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);

    render(<CurrentTaskCard projectId="project-1" />);

    expect(screen.getByText("Task A")).toBeInTheDocument();
    expect(screen.getByText("Task B")).toBeInTheDocument();
  });
});
