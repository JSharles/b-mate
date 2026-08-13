import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PublicClientSection } from "schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCurrentTask } from "@/features/current-task/hooks";
import { usePublicClientSections } from "@/features/documentation/hooks";
import { ClientMainTabs } from "./client-main-tabs";

vi.mock("@/features/current-task/hooks", () => ({
  useCurrentTask: vi.fn(),
}));

vi.mock("@/features/documentation/hooks", () => ({
  usePublicClientSections: vi.fn(),
}));

const mockedUseCurrentTask = vi.mocked(useCurrentTask);
const mockedUsePublicClientSections = vi.mocked(usePublicClientSections);

function withContent(content: PublicClientSection[]) {
  mockedUsePublicClientSections.mockReturnValue({
    data: content,
    isPending: false,
  } as unknown as ReturnType<typeof usePublicClientSections>);
}

const overview = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Le projet",
  blocks: [{ type: "paragraph" as const, text: "What this project is for." }],
};
const planning = {
  id: "00000000-0000-4000-8000-000000000002",
  name: "Planning",
  blocks: [{ type: "paragraph" as const, text: "Delivery is planned for March." }],
};

describe("ClientMainTabs", () => {
  beforeEach(() => {
    mockedUseCurrentTask.mockReturnValue({
      data: [],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);
  });

  it("shows Current Task as the only tab when nothing is published yet", () => {
    withContent([]);

    render(<ClientMainTabs projectId="project-1" />);

    expect(screen.getByRole("tab", { name: "title", selected: true })).toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(1);
  });

  // specs/015 US3, and the defect that feature existed to remove: a tab is ONE
  // continuous text. Under 014 the document was the unit, so a tab stacked
  // several blocks about the same subject and left the client to reconcile them.
  it("shows one continuous text per section tab", async () => {
    withContent([overview, planning]);
    const user = userEvent.setup();

    render(<ClientMainTabs projectId="project-1" />);

    await user.click(screen.getByRole("tab", { name: "Le projet" }));
    expect(screen.getByText("What this project is for.")).toBeInTheDocument();
    expect(screen.queryByText("Delivery is planned for March.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Planning" }));
    expect(screen.getByText("Delivery is planned for March.")).toBeInTheDocument();
  });

  // specs/017: the heading a client reads is the one their contributor wrote,
  // not a label the product chose, and it is shown untranslated because the
  // system cannot translate what it did not author (research Decision 7).
  it("labels each tab with the name its author gave it", () => {
    withContent([overview, planning]);

    render(<ClientMainTabs projectId="project-1" />);

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "title",
      "Le projet",
      "Planning",
    ]);
  });

  // The API returns sections already in the contributor's order, so the client
  // reads them in the order chosen for them rather than in arrival order.
  it("keeps the order the API returned", () => {
    withContent([planning, overview]);

    render(<ClientMainTabs projectId="project-1" />);

    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "title",
      "Planning",
      "Le projet",
    ]);
  });

  // FR-023: a section with nothing published is absent from the response, and
  // that absence is the only mechanism producing "no empty tab".
  it("adds no tab for a section the API did not return", () => {
    withContent([overview]);

    render(<ClientMainTabs projectId="project-1" />);

    expect(screen.queryAllByRole("tab")).toHaveLength(2);
    expect(screen.queryByRole("tab", { name: "Planning" })).not.toBeInTheDocument();
  });

  // The developer names these tabs and there is one per published rubrique: a
  // row that cannot wrap pushed five long titles out of the container.
  it("lets the row of rubriques wrap rather than overflow", () => {
    vi.mocked(usePublicClientSections).mockReturnValue({
      data: [
        { id: "s1", name: "Le projet", blocks: [] },
        { id: "s2", name: "Planning et jalons", blocks: [] },
      ],
    } as never);

    render(<ClientMainTabs projectId="project-1" />);

    expect(screen.getByRole("tablist").className).toContain("flex-wrap");
  });
});