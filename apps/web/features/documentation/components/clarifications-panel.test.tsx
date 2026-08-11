import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useClarifications, useResolveClarifications } from "../hooks";
import { ClarificationsPanel } from "./clarifications-panel";

vi.mock("../hooks", () => ({ useClarifications: vi.fn(), useResolveClarifications: vi.fn() }));

describe("ClarificationsPanel", () => {
  it("shows the complete total in impact order, evidence, answer and optional leave-open actions", async () => {
    vi.mocked(useClarifications).mockReturnValue({
      data: {
        items: [
          { id: "c1", question: "Date ?", impactRank: 1, impactExplanation: "Planning client", status: "open", version: 1, evidence: [{ label: "Planning.pdf", excerpt: "12 septembre" }] },
          { id: "c2", question: "Mode hors ligne ?", impactRank: 2, impactExplanation: "Périmètre", status: "open", version: 3, evidence: [{ label: "Brief.docx", excerpt: "Offline mode" }] },
        ],
        total: 7,
        nextCursor: "cursor",
      },
      isPending: false,
      isError: false,
    } as unknown as ReturnType<typeof useClarifications>);
    const mutate = vi.fn();
    vi.mocked(useResolveClarifications).mockReturnValue({ mutate, isPending: false, isError: false } as unknown as ReturnType<typeof useResolveClarifications>);
    const user = userEvent.setup();

    render(<ClarificationsPanel projectId="project-1" revisionId="revision-1" />);
    expect(screen.getByText("total", { exact: false })).toBeVisible();
    expect(screen.getAllByRole("article").map((item) => item.textContent)).toEqual([
      expect.stringContaining("Date ?"), expect.stringContaining("Mode hors ligne ?"),
    ]);
    expect(screen.getByText("12 septembre")).toBeVisible();

    await user.type(screen.getAllByLabelText("answerLabel")[0], "19 septembre");
    await user.click(screen.getAllByRole("button", { name: "answerAction" })[0]);
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      expectedSourceRevisionId: "revision-1",
      resolutions: [{ clarificationId: "c1", expectedVersion: 1, action: "answer", answer: "19 septembre" }],
    }), expect.any(Object));

    await user.click(screen.getAllByRole("button", { name: "leaveOpenAction" })[1]);
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      resolutions: [{ clarificationId: "c2", expectedVersion: 3, action: "leave_open" }],
    }), expect.any(Object));
  });
});
