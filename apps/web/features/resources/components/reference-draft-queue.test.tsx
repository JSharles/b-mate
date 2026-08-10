import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReferenceDraft } from "schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useAcceptDraft,
  useAnswerDraftQuestions,
  useReferenceDrafts,
} from "../hooks";
import { ReferenceDraftQueue } from "./reference-draft-queue";

vi.mock("../hooks", () => ({
  useReferenceDrafts: vi.fn(),
  useAcceptDraft: vi.fn(),
  useAnswerDraftQuestions: vi.fn(),
}));

// The refusal dialog has its own spec; stubbing it keeps this file about the
// queue itself — what it lists, and what each item lets a contributor do.
vi.mock("./regenerate-draft-dialog", () => ({
  RegenerateDraftDialog: ({ draft }: { draft: ReferenceDraft | null }) => (
    <div data-testid="regenerate-dialog">{draft ? draft.categoryKey : "closed"}</div>
  ),
}));

const mockedUseReferenceDrafts = vi.mocked(useReferenceDrafts);
const mockedUseAcceptDraft = vi.mocked(useAcceptDraft);
const mockedUseAnswerQuestions = vi.mocked(useAnswerDraftQuestions);

function fakeDraft(overrides: Partial<ReferenceDraft> = {}): ReferenceDraft {
  return {
    categoryKey: "overview",
    status: "pending_review",
    content: "The reference version awaiting review.",
    trigger: "document_added",
    triggerDocumentTitle: "Architecture overview",
    attempt: 1,
    questions: [],
    createdAt: "2026-08-08T00:00:00.000Z",
    ...overrides,
  };
}

function withDrafts(drafts: ReferenceDraft[] | undefined, isPending = false) {
  mockedUseReferenceDrafts.mockReturnValue({
    data: drafts,
    isPending,
  } as unknown as ReturnType<typeof useReferenceDrafts>);
}

function mutation<T>() {
  return { mutate: vi.fn(), isPending: false } as unknown as T;
}

function acceptMutation() {
  return mutation<ReturnType<typeof useAcceptDraft>>();
}

describe("ReferenceDraftQueue", () => {
  beforeEach(() => {
    mockedUseAcceptDraft.mockReturnValue(acceptMutation());
    mockedUseAnswerQuestions.mockReturnValue(
      mutation<ReturnType<typeof useAnswerDraftQuestions>>(),
    );
    withDrafts([]);
  });

  it("shows a skeleton while the queue is loading", () => {
    withDrafts(undefined, true);

    const { container } = render(<ReferenceDraftQueue projectId="project-1" />);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("shows an empty state when nothing is waiting for review", () => {
    render(<ReferenceDraftQueue projectId="project-1" />);

    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  // FR-014a: a document touching three categories produces three independent
  // items. They are deliberately not grouped by the document that triggered
  // them — each is disposed of on its own.
  it("lists one independent item per category, each with its own actions", () => {
    withDrafts([
      fakeDraft({ categoryKey: "overview", content: "Overview reference." }),
      fakeDraft({ categoryKey: "planning", content: "Planning reference." }),
    ]);

    render(<ReferenceDraftQueue projectId="project-1" />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("Overview reference.")).toBeInTheDocument();
    expect(within(items[0]).getByRole("button", { name: "accept" })).toBeInTheDocument();
    expect(within(items[1]).getByText("Planning reference.")).toBeInTheDocument();
    expect(within(items[1]).getByRole("button", { name: "accept" })).toBeInTheDocument();
  });

  it("accepts the category the contributor acted on, not the whole queue", async () => {
    const accept = acceptMutation();
    mockedUseAcceptDraft.mockReturnValue(accept);
    withDrafts([fakeDraft({ categoryKey: "overview" }), fakeDraft({ categoryKey: "planning" })]);
    const user = userEvent.setup();

    render(<ReferenceDraftQueue projectId="project-1" />);
    const items = screen.getAllByRole("listitem");
    await user.click(within(items[1]).getByRole("button", { name: "accept" }));

    expect(accept.mutate).toHaveBeenCalledTimes(1);
    expect(accept.mutate).toHaveBeenCalledWith({ categoryKey: "planning" });
  });

  it("opens the refusal dialog on the refused draft", async () => {
    withDrafts([fakeDraft({ categoryKey: "planning" })]);
    const user = userEvent.setup();

    render(<ReferenceDraftQueue projectId="project-1" />);
    expect(screen.getByTestId("regenerate-dialog")).toHaveTextContent("closed");

    await user.click(screen.getByRole("button", { name: "refuse" }));

    expect(screen.getByTestId("regenerate-dialog")).toHaveTextContent("planning");
  });

  // A rebuild in flight has no content worth reading and neither action applies
  // to it — the API refuses both, so offering the buttons would only produce a
  // 409 the contributor cannot act on.
  it("offers no action and no text while a rebuild is still generating", () => {
    withDrafts([
      fakeDraft({ status: "generating", content: "", trigger: "regeneration_requested" }),
    ]);

    render(<ReferenceDraftQueue projectId="project-1" />);

    expect(screen.getByText("generating")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "accept" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "refuse" })).not.toBeInTheDocument();
  });

  it("says what caused each draft so it can be judged without opening the document", () => {
    withDrafts([
      fakeDraft({ categoryKey: "overview", trigger: "document_added" }),
      fakeDraft({
        categoryKey: "how_it_works",
        trigger: "document_removed",
        triggerDocumentTitle: null,
      }),
      fakeDraft({
        categoryKey: "planning",
        trigger: "regeneration_requested",
        triggerDocumentTitle: null,
      }),
    ]);

    render(<ReferenceDraftQueue projectId="project-1" />);

    expect(screen.getByText("triggerDocumentAdded")).toBeInTheDocument();
    expect(screen.getByText("triggerDocumentRemoved")).toBeInTheDocument();
    expect(screen.getByText("triggerRegeneration")).toBeInTheDocument();
  });

  // research.md Decision 4 caps regeneration at 3. Showing the attempt count
  // from the second one on is what makes the eventual refusal legible.
  it("shows the attempt count once a draft has been regenerated at least once", () => {
    withDrafts([fakeDraft({ attempt: 2, trigger: "regeneration_requested" })]);

    render(<ReferenceDraftQueue projectId="project-1" />);

    expect(screen.getByText(/attempt/)).toBeInTheDocument();
  });

  it("shows no attempt count on a first draft", () => {
    withDrafts([fakeDraft({ attempt: 1 })]);

    render(<ReferenceDraftQueue projectId="project-1" />);

    expect(screen.queryByText(/attempt/)).not.toBeInTheDocument();
  });

  // specs/015 US5.
  describe("questions", () => {
    const withQuestions = () =>
      fakeDraft({
        status: "awaiting_answers",
        questions: [
          { id: "q1", question: "Is the migration February or March?" },
          { id: "q2", question: "Which team owns the rollout?" },
        ],
      });

    it("shows nothing question-shaped on a draft that raised none", () => {
      withDrafts([fakeDraft()]);

      render(<ReferenceDraftQueue projectId="project-1" />);

      expect(screen.queryByText("questionsIntro")).not.toBeInTheDocument();
    });

    // FR-023: questions never block. Accepting with them outstanding is a
    // normal outcome, so the accept button must stay live alongside them.
    it("keeps accept available while questions are outstanding", () => {
      withDrafts([withQuestions()]);

      render(<ReferenceDraftQueue projectId="project-1" />);

      expect(screen.getByText("questionsIntro")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "accept" })).toBeEnabled();
    });

    it("sends only the questions the contributor actually answered", async () => {
      const answer = mutation<ReturnType<typeof useAnswerDraftQuestions>>();
      mockedUseAnswerQuestions.mockReturnValue(answer);
      withDrafts([withQuestions()]);
      const user = userEvent.setup();

      render(<ReferenceDraftQueue projectId="project-1" />);
      await user.type(
        screen.getByLabelText("Is the migration February or March?"),
        "March.",
      );
      await user.click(screen.getByRole("button", { name: "answer" }));

      expect(answer.mutate).toHaveBeenCalledWith({
        categoryKey: "overview",
        answers: [{ questionId: "q1", answer: "March." }],
      });
    });

    it("has nothing to send until something is typed", () => {
      withDrafts([withQuestions()]);

      render(<ReferenceDraftQueue projectId="project-1" />);

      expect(screen.getByRole("button", { name: "answer" })).toBeDisabled();
    });
  });
});
