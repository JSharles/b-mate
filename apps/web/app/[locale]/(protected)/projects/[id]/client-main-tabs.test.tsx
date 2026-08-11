import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PublicClientCategory } from "schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCurrentTask } from "@/features/current-task/hooks";
import { usePublicClientCategories } from "@/features/documentation/hooks";
import { ClientMainTabs } from "./client-main-tabs";

vi.mock("@/features/current-task/hooks", () => ({
  useCurrentTask: vi.fn(),
}));

vi.mock("@/features/documentation/hooks", () => ({
  usePublicClientCategories: vi.fn(),
}));

const mockedUseCurrentTask = vi.mocked(useCurrentTask);
const mockedUsePublicClientCategories = vi.mocked(usePublicClientCategories);

function withContent(content: PublicClientCategory[]) {
  mockedUsePublicClientCategories.mockReturnValue({
    data: content,
    isPending: false,
  } as unknown as ReturnType<typeof usePublicClientCategories>);
}

describe("ClientMainTabs", () => {
  beforeEach(() => {
    mockedUseCurrentTask.mockReturnValue({
      data: [],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);
  });

  it("shows Current Task as the only tab when no category has content yet", () => {
    withContent([]);

    render(<ClientMainTabs projectId="project-1" />);

    expect(screen.getByRole("tab", { name: "title", selected: true })).toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(1);
  });

  // specs/015 US3, and the defect this feature exists to remove: a category is
  // ONE continuous text. Under 014 the document was the unit, so a tab stacked
  // several blocks about the same subject and left the client to reconcile them.
  it("shows one continuous text per category tab", async () => {
    withContent([
      { categoryKey: "overview", blocks: [{ type: "paragraph", text: "What this project is for." }] },
      { categoryKey: "planning", blocks: [{ type: "paragraph", text: "Delivery is planned for March." }] },
    ]);
    const user = userEvent.setup();

    render(<ClientMainTabs projectId="project-1" />);

    await user.click(screen.getByRole("tab", { name: "category_overview" }));
    expect(screen.getByText("What this project is for.")).toBeInTheDocument();
    expect(screen.queryByText("Delivery is planned for March.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "category_planning" }));
    expect(screen.getByText("Delivery is planned for March.")).toBeInTheDocument();
  });

  // FR-022: tab order follows the frozen list, not whatever order the API
  // returned, so tabs never reshuffle as content accumulates — and `other` is
  // always last.
  it("orders tabs by the frozen category list regardless of response order", () => {
    withContent([
      { categoryKey: "other", blocks: [{ type: "paragraph", text: "Leftovers." }] },
      { categoryKey: "overview", blocks: [{ type: "paragraph", text: "Purpose." }] },
    ]);

    render(<ClientMainTabs projectId="project-1" />);

    const tabNames = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabNames).toEqual(["title", "category_overview", "category_other"]);
  });

  // FR-012: a category with nothing to say is absent from the response, and
  // that absence is the only mechanism producing "no empty tab".
  it("adds no tab for a category the API did not return", () => {
    withContent([{ categoryKey: "overview", blocks: [{ type: "paragraph", text: "Purpose." }] }]);

    render(<ClientMainTabs projectId="project-1" />);

    expect(screen.queryAllByRole("tab")).toHaveLength(2);
    expect(screen.queryByRole("tab", { name: "category_how_it_works" })).not.toBeInTheDocument();
  });
});
