import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useCurrentTask } from "../hooks";
import { CurrentTaskCard } from "./current-task-card";

vi.mock("../hooks", () => ({
  useCurrentTask: vi.fn(),
}));

const mockedUseCurrentTask = vi.mocked(useCurrentTask);

const baseItem = {
  why: null,
  impact: null,
  status: null,
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

  it("shows the title and why directly on the card, with no link to GitHub (clients never go there)", () => {
    mockedUseCurrentTask.mockReturnValue({
      data: [
        {
          ...baseItem,
          title: "Fix race condition",
          why: "Two people editing the same thing could silently lose one change.",
          impact: "Nothing changes in how you use the product.",
          status: "A first version was built and is being reviewed.",
        },
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);

    render(<CurrentTaskCard projectId="project-1" />);

    expect(screen.getByText("Fix race condition")).toBeInTheDocument();
    expect(
      screen.getByText("Two people editing the same thing could silently lose one change."),
    ).toBeInTheDocument();
    expect(screen.getByText("why")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the title with no why section when the item has why null (e.g. a draft issue)", () => {
    mockedUseCurrentTask.mockReturnValue({
      data: [{ ...baseItem, title: "Draft: sketch the new flow" }],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);

    render(<CurrentTaskCard projectId="project-1" />);

    expect(screen.getByText("Draft: sketch the new flow")).toBeInTheDocument();
    expect(screen.queryByText("why")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  // 2026-08-10: impact/état never render on the card itself (only "read
  // more" reveals them) — only why (short by the vulgarization prompt's
  // own design) stays directly on the card. The panel always shows the
  // same three sections (why repeated, impact, état) and the button
  // always renders, regardless of which fields the AI actually filled in
  // for that task — a client shouldn't find a differently-shaped panel
  // from one task to the next. A field the model genuinely left null
  // still gets its own section, with a "not provided" placeholder instead
  // of being omitted.
  describe("detail panel (why/impact/état, always shown)", () => {
    it("always shows the 'read more' link, even when why/impact/état are all null", () => {
      mockedUseCurrentTask.mockReturnValue({
        data: [{ ...baseItem, title: "Task A" }],
        isPending: false,
      } as unknown as ReturnType<typeof useCurrentTask>);

      render(<CurrentTaskCard projectId="project-1" />);

      expect(screen.getByRole("button", { name: "readMore" })).toBeInTheDocument();
    });

    it("never shows impact directly on the card, only behind 'read more'", () => {
      mockedUseCurrentTask.mockReturnValue({
        data: [{ ...baseItem, title: "Task A", impact: "Nothing changes day to day." }],
        isPending: false,
      } as unknown as ReturnType<typeof useCurrentTask>);

      render(<CurrentTaskCard projectId="project-1" />);

      expect(screen.queryByText("Nothing changes day to day.")).not.toBeInTheDocument();
    });

    it("opens a Sheet with all three sections (why/impact/état) when 'read more' is clicked", async () => {
      mockedUseCurrentTask.mockReturnValue({
        data: [
          {
            ...baseItem,
            title: "Task A",
            why: "Some accounts could stay accessible longer than they should.",
            impact: "Nothing changes day to day.",
            status: "A first version was built and is being reviewed.",
          },
        ],
        isPending: false,
      } as unknown as ReturnType<typeof useCurrentTask>);
      const user = userEvent.setup();

      render(<CurrentTaskCard projectId="project-1" />);
      await user.click(screen.getByRole("button", { name: "readMore" }));

      // Radix marks everything outside the open Sheet aria-hidden (correct
      // focus-trap behavior), so a role query only reaches the Sheet's own
      // copy of the title while it's open.
      expect(screen.getByRole("heading", { name: "Task A" })).toBeInTheDocument();
      expect(screen.getByText("Nothing changes day to day.")).toBeInTheDocument();
      expect(
        screen.getByText("A first version was built and is being reviewed."),
      ).toBeInTheDocument();
      expect(screen.getByText("impact")).toBeInTheDocument();
      expect(screen.getByText("status")).toBeInTheDocument();
      // why is duplicated (card + Sheet) once the Sheet is open.
      expect(
        screen.getAllByText("Some accounts could stay accessible longer than they should."),
      ).toHaveLength(2);
    });

    it("shows a 'not provided' placeholder for whichever fields the AI left null, instead of omitting them", async () => {
      mockedUseCurrentTask.mockReturnValue({
        data: [{ ...baseItem, title: "Task A" }],
        isPending: false,
      } as unknown as ReturnType<typeof useCurrentTask>);
      const user = userEvent.setup();

      render(<CurrentTaskCard projectId="project-1" />);
      await user.click(screen.getByRole("button", { name: "readMore" }));

      expect(screen.getByText("impact")).toBeInTheDocument();
      expect(screen.getByText("status")).toBeInTheDocument();
      expect(screen.getAllByText("notProvided")).toHaveLength(3);
    });
  });

  it("shows more than one item when multiple are in progress", () => {
    mockedUseCurrentTask.mockReturnValue({
      data: [
        { ...baseItem, title: "Task A" },
        { ...baseItem, title: "Task B" },
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);

    render(<CurrentTaskCard projectId="project-1" />);

    expect(screen.getByText("Task A")).toBeInTheDocument();
    expect(screen.getByText("Task B")).toBeInTheDocument();
  });

  // 2026-08-10: multiple in-progress items used to stack vertically in one
  // long scroll — a carousel now pages through them one at a time instead.
  describe("carousel (2+ in-progress items)", () => {
    it("shows no carousel navigation at all when there's only a single task", () => {
      mockedUseCurrentTask.mockReturnValue({
        data: [{ ...baseItem, title: "Task A" }],
        isPending: false,
      } as unknown as ReturnType<typeof useCurrentTask>);

      render(<CurrentTaskCard projectId="project-1" />);

      expect(screen.queryByRole("button", { name: "previousTask" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "nextTask" })).not.toBeInTheDocument();
      expect(screen.queryByText(/taskCounter/)).not.toBeInTheDocument();
    });

    it("shows a task counter and both nav buttons for 3 in-progress items", () => {
      mockedUseCurrentTask.mockReturnValue({
        data: [
          { ...baseItem, title: "Task A" },
          { ...baseItem, title: "Task B" },
          { ...baseItem, title: "Task C" },
        ],
        isPending: false,
      } as unknown as ReturnType<typeof useCurrentTask>);

      render(<CurrentTaskCard projectId="project-1" />);

      expect(screen.getByText(/taskCounter/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "previousTask" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "nextTask" })).toBeInTheDocument();
    });

    // jsdom has no real layout engine, so embla-carousel's own scroll-bound
    // math (canScrollPrev/canScrollNext) can't be meaningfully asserted
    // here — this only verifies the click handler is wired up and doesn't
    // throw, not the resulting scroll position.
    it("does not throw when the next/previous buttons are clicked", async () => {
      mockedUseCurrentTask.mockReturnValue({
        data: [
          { ...baseItem, title: "Task A" },
          { ...baseItem, title: "Task B" },
        ],
        isPending: false,
      } as unknown as ReturnType<typeof useCurrentTask>);
      const user = userEvent.setup();

      render(<CurrentTaskCard projectId="project-1" />);
      await user.click(screen.getByRole("button", { name: "nextTask" }));
      await user.click(screen.getByRole("button", { name: "previousTask" }));

      expect(screen.getByText("Task A")).toBeInTheDocument();
      expect(screen.getByText("Task B")).toBeInTheDocument();
    });

    // 2026-08-10: rebuilt so the whole card slides and a peeking neighbor
    // is visible (not just its content) — that peeking card is itself
    // clickable, a full-cover overlay button only present while it isn't
    // the selected one (removed once it becomes active, so the real card
    // content underneath is never blocked from interaction). Only one of
    // the three cards is selected at a time, so exactly items.length - 1
    // overlay buttons should exist.
    it("exposes a click target on every peeking (non-selected) card, but not the selected one", () => {
      mockedUseCurrentTask.mockReturnValue({
        data: [
          { ...baseItem, title: "Task A" },
          { ...baseItem, title: "Task B" },
          { ...baseItem, title: "Task C" },
        ],
        isPending: false,
      } as unknown as ReturnType<typeof useCurrentTask>);

      render(<CurrentTaskCard projectId="project-1" />);

      expect(screen.getAllByRole("button", { name: "selectTask" })).toHaveLength(2);
    });
  });

  it("shows a combined timeline sentence with the start date and the updated-at time", () => {
    mockedUseCurrentTask.mockReturnValue({
      data: [{ ...baseItem, title: "Task A" }],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);

    render(<CurrentTaskCard projectId="project-1" />);

    expect(screen.getByText(/timeline/)).toBeInTheDocument();
  });

  // specs/008-current-task-progress FR-008: no progress bar / no estimate
  // text at all when there's no estimate — never a misleading 0%/broken bar.
  it("shows no progress bar and no estimate text when estimatedCompletionAt is null", () => {
    mockedUseCurrentTask.mockReturnValue({
      data: [{ ...baseItem, title: "Task A", estimatedCompletionAt: null }],
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
      data: [{ ...baseItem, title: "Task A" }],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);

    render(<CurrentTaskCard projectId="project-1" />);

    expect(screen.getByRole("heading", { level: 2, name: "Task A" })).toBeInTheDocument();
  });

  it("exposes the progress bar's percentage to assistive tech via role=progressbar", () => {
    mockedUseCurrentTask.mockReturnValue({
      data: [
        {
          ...baseItem,
          title: "Task A",
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
