import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import type { Resource } from "schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useResources } from "../hooks";
import { ResourcesList } from "./resources-list";

vi.mock("../hooks", () => ({
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

vi.mock("./add-resource-dialog", () => ({
  AddResourceDialog: vi.fn(({ open }: { open: boolean }) => (
    <div data-testid="add-resource-dialog">{open ? "open" : "closed"}</div>
  )),
}));

const mockedUseResources = vi.mocked(useResources);

function fakeResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: "resource-1",
    projectId: "project-1",
    source: "upload",
    status: "absorbed",
    title: "Architecture overview",
    originalFileUrl: null,
    originalFileName: "a.pdf",
    originalFileMimeType: "application/pdf",
    notionPageUrl: null,
    failureReason: null,
    createdAt: "2026-08-08T00:00:00.000Z",
    ...overrides,
  };
}

describe("ResourcesList", () => {
  beforeEach(() => {
    mockedUseResources.mockReturnValue({
      data: undefined,
      isPending: true,
    } as unknown as ReturnType<typeof useResources>);
  });

  it("shows a skeleton while pending", () => {
    const { container } = render(<ResourcesList projectId="project-1" />);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("shows an empty state when there are no resources", () => {
    mockedUseResources.mockReturnValue({
      data: [],
      isPending: false,
    } as unknown as ReturnType<typeof useResources>);

    render(<ResourcesList projectId="project-1" />);

    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  // `absorbed` is the resting state of a document whose material now lives in
  // the reference layer — it needs no badge. Only the two states a contributor
  // has to act on, or wait for, are called out.
  it("badges only the documents that are still pending or have failed", () => {
    mockedUseResources.mockReturnValue({
      data: [
        fakeResource({ id: "r1", status: "pending", title: "Doc A" }),
        fakeResource({ id: "r2", status: "failed", title: "Doc B" }),
        fakeResource({ id: "r3", status: "absorbed", title: "Doc C" }),
      ],
      isPending: false,
    } as unknown as ReturnType<typeof useResources>);

    render(<ResourcesList projectId="project-1" />);

    expect(screen.getByText("Doc A")).toBeInTheDocument();
    expect(screen.getByText("statusPending")).toBeInTheDocument();
    expect(screen.getByText("Doc B")).toBeInTheDocument();
    expect(screen.getByText("statusFailed")).toBeInTheDocument();
    expect(screen.getByText("Doc C")).toBeInTheDocument();
    expect(screen.queryByText("statusAbsorbed")).not.toBeInTheDocument();
  });

  it("shows the Add button and dialog", () => {
    mockedUseResources.mockReturnValue({
      data: [],
      isPending: false,
    } as unknown as ReturnType<typeof useResources>);

    render(<ResourcesList projectId="project-1" />);

    expect(screen.getByRole("button", { name: "add" })).toBeInTheDocument();
  });

  it("opens the add-resource dialog when the Add button is clicked", async () => {
    mockedUseResources.mockReturnValue({
      data: [],
      isPending: false,
    } as unknown as ReturnType<typeof useResources>);
    const user = userEvent.setup();

    render(<ResourcesList projectId="project-1" />);
    expect(screen.getByTestId("add-resource-dialog")).toHaveTextContent("closed");

    await user.click(screen.getByRole("button", { name: "add" }));

    expect(screen.getByTestId("add-resource-dialog")).toHaveTextContent("open");
  });
});
