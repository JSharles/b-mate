import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useCurrentTask } from "../hooks";
import { CurrentTaskCard } from "./current-task-card";

vi.mock("../hooks", () => ({
  useCurrentTask: vi.fn(),
}));

const mockedUseCurrentTask = vi.mocked(useCurrentTask);

const baseItem = {
  updatedAt: "2026-07-20T10:00:00.000Z",
  startedAt: "2026-07-18T10:00:00.000Z",
  estimatedCompletionAt: null,
  estimateConfidence: null,
};

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
          ...baseItem,
          title: "Fix race condition",
          description: "Details about the fix",
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
      data: [{ ...baseItem, title: "Draft: sketch the new flow", description: null }],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);

    render(<CurrentTaskCard projectId="project-1" />);

    expect(screen.getByText("Draft: sketch the new flow")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows more than one item when multiple are in progress", () => {
    mockedUseCurrentTask.mockReturnValue({
      data: [
        { ...baseItem, title: "Task A", description: null },
        { ...baseItem, title: "Task B", description: null },
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);

    render(<CurrentTaskCard projectId="project-1" />);

    expect(screen.getByText("Task A")).toBeInTheDocument();
    expect(screen.getByText("Task B")).toBeInTheDocument();
  });

  it("shows the start date alongside the updated-at time", () => {
    mockedUseCurrentTask.mockReturnValue({
      data: [{ ...baseItem, title: "Task A", description: null }],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);

    render(<CurrentTaskCard projectId="project-1" />);

    expect(screen.getByText(/startedAt/)).toBeInTheDocument();
  });

  // specs/008-current-task-progress FR-008: no progress bar / no estimate
  // text at all when there's no estimate — never a misleading 0%/broken bar.
  it("shows no progress bar and no estimate text when estimatedCompletionAt is null", () => {
    mockedUseCurrentTask.mockReturnValue({
      data: [{ ...baseItem, title: "Task A", description: null, estimatedCompletionAt: null }],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);

    const { container } = render(<CurrentTaskCard projectId="project-1" />);

    expect(container.querySelector('[style*="width"]')).not.toBeInTheDocument();
    expect(screen.queryByText("estimatedCompletion")).not.toBeInTheDocument();
    expect(screen.queryByText("runningOver")).not.toBeInTheDocument();
  });

  it("shows the progress bar and confidence label when an estimate is present and still in the future", () => {
    mockedUseCurrentTask.mockReturnValue({
      data: [
        {
          ...baseItem,
          title: "Task A",
          description: null,
          startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          estimatedCompletionAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          estimateConfidence: "medium",
        },
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);

    const { container } = render(<CurrentTaskCard projectId="project-1" />);

    expect(container.querySelector('[style*="width"]')).toBeInTheDocument();
    expect(screen.getByText(/estimatedCompletion/)).toBeInTheDocument();
    expect(screen.getByText(/confidence\.medium/)).toBeInTheDocument();
    expect(screen.queryByText(/runningOver/)).not.toBeInTheDocument();
  });

  it("shows the running-over state instead of a capped bar when the estimate is in the past", () => {
    mockedUseCurrentTask.mockReturnValue({
      data: [
        {
          ...baseItem,
          title: "Task A",
          description: null,
          startedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          estimatedCompletionAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          estimateConfidence: "low",
        },
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);

    render(<CurrentTaskCard projectId="project-1" />);

    expect(screen.getByText(/runningOver/)).toBeInTheDocument();
    expect(screen.queryByText(/estimatedCompletion/)).not.toBeInTheDocument();
  });

  // Impeccable critique (2026-07-25) fixes below.

  it("renders the task title as a heading, not a bare span (screen-reader heading navigation)", () => {
    mockedUseCurrentTask.mockReturnValue({
      data: [{ ...baseItem, title: "Task A", description: null }],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);

    render(<CurrentTaskCard projectId="project-1" />);

    expect(screen.getByRole("heading", { level: 3, name: "Task A" })).toBeInTheDocument();
  });

  it("exposes the progress bar's percentage to assistive tech via role=progressbar", () => {
    mockedUseCurrentTask.mockReturnValue({
      data: [
        {
          ...baseItem,
          title: "Task A",
          description: null,
          startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          estimatedCompletionAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          estimateConfidence: "medium",
        },
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);

    render(<CurrentTaskCard projectId="project-1" />);

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "50");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("marks a low-confidence estimate and a running-over task with the same semantic severity color", () => {
    mockedUseCurrentTask.mockReturnValue({
      data: [
        {
          ...baseItem,
          title: "Task A",
          description: null,
          startedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          estimatedCompletionAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          estimateConfidence: "low",
        },
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);

    render(<CurrentTaskCard projectId="project-1" />);

    expect(screen.getByText(/runningOver/)).toHaveClass("text-destructive");
    expect(screen.getByText(/confidence\.low/)).toHaveClass("text-destructive");
  });

  it("keeps a high-confidence, on-track estimate in the neutral (non-alarming) color", () => {
    mockedUseCurrentTask.mockReturnValue({
      data: [
        {
          ...baseItem,
          title: "Task A",
          description: null,
          startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          estimatedCompletionAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          estimateConfidence: "high",
        },
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);

    render(<CurrentTaskCard projectId="project-1" />);

    expect(screen.getByText(/estimatedCompletion/)).toHaveClass("text-muted-foreground");
    expect(screen.getByText(/confidence\.high/)).toHaveClass("text-muted-foreground");
  });
});
