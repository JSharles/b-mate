import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useDocumentationWorkspace, useReferenceSummary } from "../hooks";
import { useProject } from "@/features/projects/hooks";
import { ClientContentPage } from "./client-content-page";

vi.mock("../hooks", () => ({
  useDocumentationWorkspace: vi.fn(),
  useReferenceSummary: vi.fn(),
}));
vi.mock("@/features/projects/hooks", () => ({ useProject: vi.fn() }));
vi.mock("./section-list", () => ({
  SectionList: () => <div>section-list</div>,
}));
vi.mock("./client-content-preview", () => ({
  ClientContentPreview: () => <div>client-preview</div>,
}));

const replace = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ replace }),
}));

function withReference(document: unknown, isPending = false) {
  vi.mocked(useReferenceSummary).mockReturnValue({
    data: isPending ? undefined : { document },
    isPending,
    isError: false,
  } as never);
}

describe("ClientContentPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useProject).mockReturnValue({
      data: { role: "contributor" },
      isPending: false,
      isError: false,
    } as never);
    vi.mocked(useDocumentationWorkspace).mockReturnValue({
      data: {
        priority: "published",
        clientVisibility: "current_version_visible",
        releaseProgress: null,
        pendingReviewCount: 0,
        failedOperationCount: 0,
      },
      isPending: false,
      isError: false,
    } as never);
    withReference({ status: "ready" });
  });

  it("shows the sections and what the client sees", () => {
    render(<ClientContentPage projectId="project-1" />);

    expect(screen.getByRole("heading", { name: "title" })).toBeVisible();
    expect(screen.getByText("section-list")).toBeVisible();
    expect(screen.getByText("client-preview")).toBeVisible();
  });

  // A section is written from the reference document, so there is nothing to
  // write before one exists. Said up front rather than discovered by pressing a
  // button that fails: the API refuses it too.
  it("waits for the documentary base rather than offering work that would fail", () => {
    withReference(null);

    render(<ClientContentPage projectId="project-1" />);

    expect(screen.getByText("lockedTitle")).toBeVisible();
    expect(screen.queryByText("section-list")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /lockedAction/ }),
    ).toHaveAttribute("href", "/projects/project-1/documents");
  });

  it("still waits while the document is only being written", () => {
    withReference({ status: "writing" });

    render(<ClientContentPage projectId="project-1" />);

    expect(screen.getByText("lockedTitle")).toBeVisible();
  });

  // Locking on a value that has not arrived yet would flash the locked state on
  // every load of a project that is perfectly ready.
  it("says nothing until it knows", () => {
    withReference(null, true);

    render(<ClientContentPage projectId="project-1" />);

    expect(screen.queryByText("lockedTitle")).not.toBeInTheDocument();
    expect(screen.queryByText("section-list")).not.toBeInTheDocument();
  });

  it("says what the client can see, and what waits for the developer", () => {
    render(<ClientContentPage projectId="project-1" />);

    expect(screen.getByText("priority_published")).toBeVisible();
    expect(screen.getByText("visibility_current_version_visible")).toBeVisible();
  });

  // The failing write is not on this page, but the base lists it — so the
  // banner carries the way there rather than naming a problem with no action.
  it("points at the base when a write did not finish", () => {
    vi.mocked(useDocumentationWorkspace).mockReturnValue({
      data: {
        priority: "needs_attention",
        clientVisibility: "nothing_published",
        releaseProgress: null,
        pendingReviewCount: 0,
        failedOperationCount: 1,
      },
      isPending: false,
      isError: false,
    } as never);

    render(<ClientContentPage projectId="project-1" />);

    expect(screen.getByRole("link", { name: /failedAction/ })).toHaveAttribute(
      "href",
      "/projects/project-1/documents",
    );
  });

  it("redirects a client away from the contributor surface", () => {
    vi.mocked(useProject).mockReturnValue({
      data: { role: "client" },
      isPending: false,
      isError: false,
    } as never);

    render(<ClientContentPage projectId="project-1" />);

    expect(replace).toHaveBeenCalledWith("/projects/project-1");
    expect(screen.queryByText("section-list")).not.toBeInTheDocument();
  });
});
