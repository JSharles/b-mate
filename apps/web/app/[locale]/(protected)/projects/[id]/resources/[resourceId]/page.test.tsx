import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { useProject } from "@/features/projects/hooks";
import { useResource } from "@/features/resources/hooks";
import ResourceDetailPage from "./page";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, use: (value: unknown) => value };
});

vi.mock("@/features/projects/hooks", () => ({
  useProject: vi.fn(),
}));

vi.mock("@/features/resources/hooks", () => ({
  useResource: vi.fn(),
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

vi.mock("@/features/resources/components/resource-detail-page-content", () => ({
  ResourceDetailPageContent: ({
    projectId,
    resource,
    canManage,
  }: {
    projectId: string;
    resource: { id: string };
    canManage: boolean;
  }) => (
    <div>
      resource-detail-page-content:{projectId}:{resource.id}:{String(canManage)}
    </div>
  ),
}));

const mockedUseProject = vi.mocked(useProject);
const mockedUseResource = vi.mocked(useResource);

function renderPage() {
  return render(
    <ResourceDetailPage
      params={
        { id: "project-1", resourceId: "resource-1" } as unknown as Promise<{
          id: string;
          resourceId: string;
        }>
      }
    />,
  );
}

function mockLoaded(role: "contributor" | "client") {
  mockedUseProject.mockReturnValue({
    data: { id: "project-1", title: "Site vitrine client X", role, isAdmin: false },
    isPending: false,
  } as unknown as ReturnType<typeof useProject>);
  mockedUseResource.mockReturnValue({
    data: { id: "resource-1", title: "Architecture overview" },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useResource>);
}

describe("ResourceDetailPage", () => {
  it("passes canManage=true for a contributor", () => {
    mockLoaded("contributor");

    renderPage();

    expect(
      screen.getByText("resource-detail-page-content:project-1:resource-1:true"),
    ).toBeInTheDocument();
  });

  it("passes canManage=false for a client", () => {
    mockLoaded("client");

    renderPage();

    expect(
      screen.getByText("resource-detail-page-content:project-1:resource-1:false"),
    ).toBeInTheDocument();
  });

  it("shows a back link to the project", () => {
    mockLoaded("contributor");

    renderPage();

    expect(screen.getByRole("link", { name: "backToProject" })).toHaveAttribute(
      "href",
      "/projects/project-1",
    );
  });

  it("shows a skeleton while the project or the resource is pending", () => {
    mockedUseProject.mockReturnValue({
      data: undefined,
      isPending: true,
    } as unknown as ReturnType<typeof useProject>);
    mockedUseResource.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useResource>);

    const { container } = renderPage();

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("shows an explicit error state with a retry action when the resource fails to load", () => {
    mockedUseProject.mockReturnValue({
      data: { id: "project-1", title: "Site vitrine client X", role: "contributor", isAdmin: false },
      isPending: false,
    } as unknown as ReturnType<typeof useProject>);
    mockedUseResource.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useResource>);

    renderPage();

    expect(screen.getByText("loadErrorTitle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "loadErrorRetry" })).toBeInTheDocument();
  });

  it("calls refetch when the retry button is clicked", async () => {
    const refetch = vi.fn();
    mockedUseProject.mockReturnValue({
      data: { id: "project-1", title: "Site vitrine client X", role: "contributor", isAdmin: false },
      isPending: false,
    } as unknown as ReturnType<typeof useProject>);
    mockedUseResource.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof useResource>);
    const user = userEvent.setup();

    renderPage();
    await user.click(screen.getByRole("button", { name: "loadErrorRetry" }));

    expect(refetch).toHaveBeenCalled();
  });
});
