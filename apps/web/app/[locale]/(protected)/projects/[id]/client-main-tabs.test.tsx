import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import type { Resource } from "schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCurrentTask } from "@/features/current-task/hooks";
import { useResources } from "@/features/resources/hooks";
import { ClientMainTabs } from "./client-main-tabs";

vi.mock("@/features/current-task/hooks", () => ({
  useCurrentTask: vi.fn(),
}));

vi.mock("@/features/resources/hooks", () => ({
  useResources: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mockedUseCurrentTask = vi.mocked(useCurrentTask);
const mockedUseResources = vi.mocked(useResources);

function fakeResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: "resource-1",
    projectId: "project-1",
    source: "upload",
    status: "published",
    title: "Architecture overview",
    originalFileUrl: null,
    originalFileName: "a.pdf",
    originalFileMimeType: "application/pdf",
    notionPageUrl: null,
    failureReason: null,
    publishedAt: "2026-08-08T00:00:00.000Z",
    createdAt: "2026-08-08T00:00:00.000Z",
    sections: [],
    ...overrides,
  };
}

describe("ClientMainTabs", () => {
  beforeEach(() => {
    mockedUseCurrentTask.mockReturnValue({
      data: [],
      isPending: false,
    } as unknown as ReturnType<typeof useCurrentTask>);
  });

  it("shows Current Task as the first tab, open by default, with no resources yet", () => {
    mockedUseResources.mockReturnValue({
      data: [],
      isPending: false,
    } as unknown as ReturnType<typeof useResources>);

    render(<ClientMainTabs projectId="project-1" />);

    expect(screen.getByRole("tab", { name: "title", selected: true })).toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(1);
  });

  it("adds no extra tabs when no resource has an approved category yet", () => {
    mockedUseResources.mockReturnValue({
      data: [fakeResource({ id: "r1", title: "Doc A" }), fakeResource({ id: "r2", title: "Doc B" })],
      isPending: false,
    } as unknown as ReturnType<typeof useResources>);

    render(<ClientMainTabs projectId="project-1" />);

    expect(screen.queryAllByRole("tab")).toHaveLength(1);
  });

  // SC-001, the defect this whole feature exists to remove: two tabs drawing
  // from the SAME source document must show different text. Under 013 the
  // document itself was the unit, so every tab listed the same documents.
  it("shows different content in two tabs fed by the same document", async () => {
    mockedUseResources.mockReturnValue({
      data: [
        fakeResource({
          id: "r1",
          title: "Architecture overview",
          sections: [
            {
              id: "s1",
              categoryKey: "overview",
              status: "approved",
              title: "What this delivers",
              content: "The overview slice.",
            },
            {
              id: "s2",
              categoryKey: "planning",
              status: "approved",
              title: "Delivery dates",
              content: "The planning slice.",
            },
          ],
        }),
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useResources>);
    const user = userEvent.setup();

    render(<ClientMainTabs projectId="project-1" />);

    await user.click(screen.getByRole("tab", { name: "Le projet" }));
    expect(screen.getByText("The overview slice.")).toBeInTheDocument();
    expect(screen.queryByText("The planning slice.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Planning & jalons" }));
    expect(screen.getByText("The planning slice.")).toBeInTheDocument();
  });

  // FR-022: tab order follows the frozen list, not arrival order, so tabs
  // never reshuffle as content accumulates — and `other` is always last.
  it("orders tabs by the frozen category list regardless of arrival order", () => {
    mockedUseResources.mockReturnValue({
      data: [
        fakeResource({
          id: "r1",
          sections: [
            {
              id: "s1",
              categoryKey: "other",
              status: "approved",
              title: "Leftovers",
              content: "Other slice.",
            },
            {
              id: "s2",
              categoryKey: "overview",
              status: "approved",
              title: "Purpose",
              content: "Overview slice.",
            },
          ],
        }),
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useResources>);

    render(<ClientMainTabs projectId="project-1" />);

    const tabNames = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabNames).toEqual(["title", "Le projet", "Autres informations"]);
  });

  // SC-002: the first section of a tab is readable without any interaction.
  it("expands the first section of a tab on arrival", async () => {
    mockedUseResources.mockReturnValue({
      data: [
        fakeResource({
          id: "r1",
          sections: [
            {
              id: "s1",
              categoryKey: "overview",
              status: "approved",
              title: "First",
              content: "Visible immediately.",
            },
            {
              id: "s2",
              categoryKey: "overview",
              status: "approved",
              title: "Second",
              content: "Collapsed until asked for.",
            },
          ],
        }),
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useResources>);
    const user = userEvent.setup();

    render(<ClientMainTabs projectId="project-1" />);
    await user.click(screen.getByRole("tab", { name: "Le projet" }));

    expect(screen.getByText("Visible immediately.")).toBeInTheDocument();
    expect(screen.queryByText("Collapsed until asked for.")).not.toBeInTheDocument();
  });

  // SC-007: a category with nothing in it produces no tab at all.
  it("adds no tab for a category with no section", () => {
    mockedUseResources.mockReturnValue({
      data: [
        fakeResource({
          id: "r1",
          sections: [
            {
              id: "s1",
              categoryKey: "overview",
              status: "approved",
              title: "Purpose",
              content: "Overview slice.",
            },
          ],
        }),
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useResources>);

    render(<ClientMainTabs projectId="project-1" />);

    expect(screen.queryAllByRole("tab")).toHaveLength(2);
    expect(screen.queryByRole("tab", { name: "Comment ça marche" })).not.toBeInTheDocument();
  });

  it("adds no extra tabs when no resource has a section yet", () => {
    mockedUseResources.mockReturnValue({
      data: [fakeResource({ id: "r1", title: "Doc A" }), fakeResource({ id: "r2", title: "Doc B" })],
      isPending: false,
    } as unknown as ReturnType<typeof useResources>);

    render(<ClientMainTabs projectId="project-1" />);

    expect(screen.queryAllByRole("tab")).toHaveLength(1);
  });
});
