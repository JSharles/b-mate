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
    vulgarizedTitle: null,
    vulgarizedContent: null,
    failureReason: null,
    publishedAt: "2026-08-08T00:00:00.000Z",
    createdAt: "2026-08-08T00:00:00.000Z",
    categories: [],
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

  it("adds one tab per distinct approved category, alongside the Current Task tab", async () => {
    mockedUseResources.mockReturnValue({
      data: [
        fakeResource({
          id: "r1",
          title: "Doc A",
          categories: [
            { id: "a1", categoryId: "c1", key: "architecture", label: "Architecture", status: "approved" },
          ],
        }),
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useResources>);
    const user = userEvent.setup();

    render(<ClientMainTabs projectId="project-1" />);

    expect(screen.getByRole("tab", { name: "Architecture" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Architecture" }));
    expect(screen.getByText("Doc A")).toBeInTheDocument();
  });

  it("groups an uncategorized resource under 'Other', alongside real categories", () => {
    mockedUseResources.mockReturnValue({
      data: [
        fakeResource({
          id: "r1",
          title: "Categorized doc",
          categories: [
            { id: "a1", categoryId: "c1", key: "architecture", label: "Architecture", status: "approved" },
          ],
        }),
        fakeResource({ id: "r2", title: "Uncategorized doc", categories: [] }),
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useResources>);

    render(<ClientMainTabs projectId="project-1" />);

    expect(screen.getByRole("tab", { name: "Architecture" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "uncategorized" })).toBeInTheDocument();
  });

  it("only counts approved assignments toward tabs, ignoring proposed/rejected", () => {
    mockedUseResources.mockReturnValue({
      data: [
        fakeResource({
          id: "r1",
          title: "Doc A",
          categories: [
            { id: "a1", categoryId: "c1", key: "architecture", label: "Architecture", status: "proposed" },
          ],
        }),
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useResources>);

    render(<ClientMainTabs projectId="project-1" />);

    expect(screen.queryAllByRole("tab")).toHaveLength(1);
  });
});
