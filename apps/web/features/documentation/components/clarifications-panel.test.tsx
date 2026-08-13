import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useClarifications, useResolveClarifications } from "../hooks";
import { ClarificationsPanel } from "./clarifications-panel";

vi.mock("../hooks", () => ({
  useClarifications: vi.fn(),
  useResolveClarifications: vi.fn(),
}));

const first = {
  id: "c1",
  question: "Date ?",
  impactRank: 1,
  impactExplanation: "Planning client",
  status: "open",
  version: 1,
  evidence: [{ label: "Planning.pdf", excerpt: "12 septembre" }],
};
const second = {
  id: "c2",
  question: "Mode hors ligne ?",
  impactRank: 2,
  impactExplanation: "Périmètre",
  status: "open",
  version: 3,
  evidence: [{ label: "Brief.docx", excerpt: "Offline mode" }],
};

const mutate = vi.fn();

function withClarifications(
  items: unknown[],
  overrides: Record<string, unknown> = {},
) {
  vi.mocked(useClarifications).mockReturnValue({
    data: { items, total: items.length, nextCursor: null },
    isPending: false,
    isError: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useClarifications>);
}

describe("ClarificationsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useResolveClarifications).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useResolveClarifications>);
  });

  // FR-028: one decision at a time. Each point is its own slide, so the
  // contributor faces one rather than a wall — and can reach the next by
  // dragging, which arrows alone did not allow.
  it("gives each point its own slide", () => {
    withClarifications([first, second]);

    render(<ClarificationsPanel projectId="project-1" revisionId="revision-1" />);

    expect(screen.getAllByRole("group")).toHaveLength(2);
    expect(screen.getByText("Date ?")).toBeVisible();
    expect(screen.getByText("Mode hors ligne ?")).toBeVisible();
  });

  it("shows its evidence with it", () => {
    withClarifications([first]);

    render(<ClarificationsPanel projectId="project-1" revisionId="revision-1" />);

    expect(screen.getByText("12 septembre")).toBeVisible();
  });

  // FR-029/FR-030: the developer sees where they are, and can move past a point
  // without answering it.
  it("says where in the set the developer is, and offers both directions", () => {
    withClarifications([first, second]);

    render(<ClarificationsPanel projectId="project-1" revisionId="revision-1" />);

    expect(screen.getByText("position")).toBeVisible();
    expect(screen.getByRole("button", { name: "previous" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "next" })).toBeInTheDocument();
  });

  // FR-031: only what would be meaningless is dropped. The card never changes.
  it("drops the arrows and the position on a single point", () => {
    withClarifications([first]);

    render(<ClarificationsPanel projectId="project-1" revisionId="revision-1" />);

    expect(screen.getAllByRole("group")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "next" })).not.toBeInTheDocument();
    expect(screen.queryByText("position")).not.toBeInTheDocument();
  });

  it("answers the point whose card the action belongs to", async () => {
    withClarifications([first, second]);
    const user = userEvent.setup();

    render(<ClarificationsPanel projectId="project-1" revisionId="revision-1" />);
    const [firstCard] = screen.getAllByRole("group");
    await user.type(within(firstCard).getByLabelText("answerLabel"), "19 septembre");
    await user.click(within(firstCard).getByRole("button", { name: "answerAction" }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedSourceRevisionId: "revision-1",
        resolutions: [
          {
            clarificationId: "c1",
            expectedVersion: 1,
            action: "answer",
            answer: "19 septembre",
          },
        ],
      }),
      expect.any(Object),
    );
  });

  it("leaves open the point whose card the action belongs to", async () => {
    withClarifications([first, second]);
    const user = userEvent.setup();

    render(<ClarificationsPanel projectId="project-1" revisionId="revision-1" />);
    const secondCard = screen.getAllByRole("group")[1];
    await user.click(within(secondCard).getByRole("button", { name: "leaveOpenAction" }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        resolutions: [
          { clarificationId: "c2", expectedVersion: 3, action: "leave_open" },
        ],
      }),
      expect.any(Object),
    );
  });

  // Answering removes a point from the set, so the reported position can land
  // past the end. It is clamped rather than reading "3 sur 1".
  it("never reports a position past the end when the set shrinks", () => {
    withClarifications([first]);

    render(<ClarificationsPanel projectId="project-1" revisionId="revision-1" />);

    expect(screen.getAllByRole("group")).toHaveLength(1);
    expect(screen.getByText("Date ?")).toBeVisible();
  });

  // Cards of unequal content should still read as one row: without stretch the
  // shorter card stopped short of the taller one and the row was ragged.
  it("stretches the cards to one another", () => {
    withClarifications([first, second]);

    render(<ClarificationsPanel projectId="project-1" revisionId="revision-1" />);

    const track = screen.getAllByRole("group")[0].parentElement!;
    expect(track.className).toContain("items-stretch");
  });

  it("shows nothing at all when there is nothing to clarify", () => {
    withClarifications([]);

    const { container } = render(
      <ClarificationsPanel projectId="project-1" revisionId="revision-1" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("says the points failed to load rather than showing none", () => {
    withClarifications([], { isError: true, data: undefined });

    render(<ClarificationsPanel projectId="project-1" revisionId="revision-1" />);

    expect(screen.getByRole("alert")).toHaveTextContent("loadError");
  });
});
