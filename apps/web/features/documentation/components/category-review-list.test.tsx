import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api-client";
import {
  useCategoryDraft,
  useCategoryDrafts,
  useCorrectCategoryDraft,
  useReviewCategoryDraft,
} from "../hooks";
import { CategoryReviewList } from "./category-review-list";

vi.mock("../hooks", () => ({
  useCategoryDraft: vi.fn(),
  useCategoryDrafts: vi.fn(),
  useCorrectCategoryDraft: vi.fn(),
  useReviewCategoryDraft: vi.fn(),
}));

const reviewMutate = vi.fn();
const correctMutate = vi.fn();

describe("CategoryReviewList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useReviewCategoryDraft).mockReturnValue({ mutate: reviewMutate } as never);
    vi.mocked(useCorrectCategoryDraft).mockReturnValue({
      mutate: correctMutate,
      data: undefined,
    } as never);
    vi.mocked(useCategoryDraft).mockReturnValue({ data: undefined } as never);
  });

  it("distinguishes loading and an empty review queue", () => {
    vi.mocked(useCategoryDrafts).mockReturnValue({ isPending: true } as never);
    const { rerender } = render(<CategoryReviewList projectId="project-1" />);
    expect(screen.getByText("loading")).toBeVisible();

    vi.mocked(useCategoryDrafts).mockReturnValue({ isPending: false, data: [] } as never);
    rerender(<CategoryReviewList projectId="project-1" />);
    expect(screen.getByText("empty")).toBeVisible();
  });

  it("reviews a factual draft and submits a contributor correction", () => {
    const draft = {
      id: "00000000-0000-4000-8000-000000000001",
      categoryKey: "overview",
      sourceRevisionId: "00000000-0000-4000-8000-000000000002",
      status: "pending_review",
      version: 3,
      changeSummary: "One date changed",
      createdAt: "2026-08-11T12:00:00.000Z",
    };
    vi.mocked(useCategoryDrafts).mockReturnValue({
      isPending: false,
      data: [{ activeDraft: draft }],
    } as never);
    vi.mocked(useCategoryDraft).mockReturnValue({
      data: {
        ...draft,
        blocks: [
          {
            type: "fact",
            text: "The launch is scheduled",
            informationItemIds: ["00000000-0000-4000-8000-000000000003"],
          },
          {
            type: "open_point",
            text: "The date still needs confirmation",
            informationItemIds: ["00000000-0000-4000-8000-000000000004"],
            openPointId: "00000000-0000-4000-8000-000000000004",
          },
        ],
        provenanceSummary: [],
      },
    } as never);

    render(<CategoryReviewList projectId="project-1" />);
    fireEvent.click(screen.getByRole("button", { name: /category_overview/i }));
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    fireEvent.click(screen.getByRole("button", { name: /discard/i }));
    fireEvent.change(screen.getByLabelText("correctionLabel"), {
      target: { value: "The confirmed date is 12 September." },
    });
    fireEvent.click(screen.getByRole("button", { name: "regenerate" }));

    expect(reviewMutate).toHaveBeenNthCalledWith(1, {
      draftId: draft.id,
      action: "accept",
      expectedVersion: 3,
    });
    expect(reviewMutate).toHaveBeenNthCalledWith(2, {
      draftId: draft.id,
      action: "discard",
      expectedVersion: 3,
    });
    expect(correctMutate).toHaveBeenCalledWith({
      draftId: draft.id,
      expectedVersion: 3,
      instruction: "The confirmed date is 12 September.",
    });
  });

  it("redirects editorial feedback to project settings", () => {
    vi.mocked(useCategoryDrafts).mockReturnValue({ isPending: false, data: [] } as never);
    vi.mocked(useCorrectCategoryDraft).mockReturnValue({
      mutate: correctMutate,
      data: { routingCode: "EDITORIAL_INSTRUCTION_REQUIRED" },
    } as never);
    render(<CategoryReviewList projectId="project-1" />);
    expect(screen.queryByText("editorialRedirect")).not.toBeInTheDocument();
  });

  // These mutations suppress the global toast, so a rejected write used to be
  // indistinguishable from a dead button — and a version conflict is routine
  // here, because the workspace polls while the contributor is deciding.
  describe("when a write is rejected", () => {
    function draftInReview() {
      const draft = {
        id: "00000000-0000-4000-8000-000000000001",
        categoryKey: "overview",
        version: 3,
        changeSummary: "One date changed",
      };
      vi.mocked(useCategoryDrafts).mockReturnValue({
        isPending: false,
        data: [{ activeDraft: draft }],
      } as never);
      vi.mocked(useCategoryDraft).mockReturnValue({
        data: { ...draft, blocks: [{ type: "fact", text: "The launch is scheduled" }] },
      } as never);
      return draft;
    }

    it("names a version conflict rather than failing silently", () => {
      draftInReview();
      vi.mocked(useReviewCategoryDraft).mockReturnValue({
        mutate: reviewMutate,
        error: new ApiError("conflict", 409),
      } as never);

      render(<CategoryReviewList projectId="project-1" />);

      expect(screen.getByRole("alert")).toHaveTextContent("staleError");
    });

    it("falls back to a generic failure for anything else", () => {
      draftInReview();
      vi.mocked(useReviewCategoryDraft).mockReturnValue({
        mutate: reviewMutate,
        error: new ApiError("boom", 500),
      } as never);

      render(<CategoryReviewList projectId="project-1" />);

      expect(screen.getByRole("alert")).toHaveTextContent("error");
    });

    it("surfaces a rejected correction too", () => {
      draftInReview();
      vi.mocked(useCorrectCategoryDraft).mockReturnValue({
        mutate: correctMutate,
        data: undefined,
        error: new ApiError("conflict", 409),
      } as never);

      render(<CategoryReviewList projectId="project-1" />);

      expect(screen.getByRole("alert")).toHaveTextContent("staleError");
    });

    // A second click on an in-flight action is what produces the conflict in
    // the first place.
    it("locks both review actions while one is in flight", () => {
      draftInReview();
      vi.mocked(useReviewCategoryDraft).mockReturnValue({
        mutate: reviewMutate,
        isPending: true,
      } as never);

      render(<CategoryReviewList projectId="project-1" />);

      expect(screen.getByRole("button", { name: /accept/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /discard/i })).toBeDisabled();
    });
  });

  // Without this the rail had no selected state at all: move the mouse away and
  // neither a sighted nor a screen-reader user could tell which draft was open.
  it("marks the selected category as pressed", () => {
    const draft = {
      id: "00000000-0000-4000-8000-000000000001",
      categoryKey: "overview",
      version: 3,
      changeSummary: "One date changed",
    };
    vi.mocked(useCategoryDrafts).mockReturnValue({
      isPending: false,
      data: [{ activeDraft: draft }],
    } as never);

    render(<CategoryReviewList projectId="project-1" />);
    const button = screen.getByRole("button", { name: /category_overview/i });
    expect(button).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  // Accepting is the action the whole product exists for, and it produced no
  // acknowledgement anywhere in the viewport: the only signals were a count
  // badge silently decrementing and a banner five sections up.
  describe("after a review lands", () => {
    function draftInReview() {
      const draft = {
        id: "00000000-0000-4000-8000-000000000001",
        categoryKey: "overview",
        version: 3,
        changeSummary: "One date changed",
      };
      vi.mocked(useCategoryDrafts).mockReturnValue({
        isPending: false,
        data: [{ activeDraft: draft }],
      } as never);
      vi.mocked(useCategoryDraft).mockReturnValue({
        data: { ...draft, blocks: [{ type: "fact", text: "The launch is scheduled" }] },
      } as never);
    }

    it("says the category was approved and what is left before publication", () => {
      draftInReview();
      vi.mocked(useReviewCategoryDraft).mockReturnValue({
        mutate: reviewMutate,
        isSuccess: true,
        variables: { action: "accept" },
      } as never);

      render(<CategoryReviewList projectId="project-1" />);

      expect(screen.getByRole("status")).toHaveTextContent("accepted");
    });

    it("reassures that discarding leaves the published version alone", () => {
      draftInReview();
      vi.mocked(useReviewCategoryDraft).mockReturnValue({
        mutate: reviewMutate,
        isSuccess: true,
        variables: { action: "discard" },
      } as never);

      render(<CategoryReviewList projectId="project-1" />);

      expect(screen.getByRole("status")).toHaveTextContent("discarded");
    });
  });

  // The instruction used to live at list level and never cleared on selection
  // change, so a correction typed for one category could be sent against
  // another — against an immutable source, that costs a real revision to undo.
  it("keeps each category's correction with its own draft", () => {
    const drafts = [
      { id: "draft-a", categoryKey: "overview", version: 1, changeSummary: "A" },
      { id: "draft-b", categoryKey: "planning", version: 1, changeSummary: "B" },
    ];
    vi.mocked(useCategoryDrafts).mockReturnValue({
      isPending: false,
      data: drafts.map((activeDraft) => ({ activeDraft })),
    } as never);
    vi.mocked(useCategoryDraft).mockImplementation(
      (_projectId: string, draftId: string | null) =>
        ({
          data: draftId
            ? { ...drafts.find((d) => d.id === draftId), blocks: [] }
            : undefined,
        }) as never,
    );

    render(<CategoryReviewList projectId="project-1" />);
    fireEvent.click(screen.getByRole("button", { name: /category_overview/i }));
    fireEvent.change(screen.getByLabelText("correctionLabel"), {
      target: { value: "The date is 18 September." },
    });

    fireEvent.click(screen.getByRole("button", { name: /category_planning/i }));

    expect(screen.getByLabelText("correctionLabel")).toHaveValue("");
  });
});
