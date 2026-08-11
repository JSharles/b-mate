import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
});
