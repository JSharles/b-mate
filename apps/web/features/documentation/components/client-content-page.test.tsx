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
    data: isPending ? undefined : { document, documentCount: 2 },
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
        activeOperationCount: 0,
        failedOperationCount: 0,
        currentReleaseId: "release-1",
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

  // A section is written from the reference document, so a project without one
  // has a first step rather than a locked door — and the step takes the
  // developer straight to where it happens.
  it("names the first step instead of refusing", () => {
    withReference(null);

    render(<ClientContentPage projectId="project-1" />);

    expect(screen.getByText("startTitle")).toBeVisible();
    expect(screen.getByText("startDescription")).toBeVisible();
    expect(screen.queryByText("section-list")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /startAction/ })).toHaveAttribute(
      "href",
      "/projects/project-1/documentation/sources",
    );
  });

  it("says the writing is under way rather than repeating the first step", () => {
    withReference({ status: "writing" });

    render(<ClientContentPage projectId="project-1" />);

    expect(screen.getByText("startWriting")).toBeVisible();
    expect(screen.queryByText("startDescription")).not.toBeInTheDocument();
  });

  // Deciding on a value that has not arrived yet would flash the first step on
  // every load of a project that is perfectly ready.
  it("says nothing until it knows", () => {
    withReference(null, true);

    render(<ClientContentPage projectId="project-1" />);

    expect(screen.queryByText("startTitle")).not.toBeInTheDocument();
    expect(screen.queryByText("section-list")).not.toBeInTheDocument();
  });

  // The documents are what this page runs on, so they are stated here and
  // reached from here rather than sitting beside it in the navigation.
  it("says what it runs on, and offers the way to change it", () => {
    render(<ClientContentPage projectId="project-1" />);

    expect(screen.getByText("sourceReady")).toBeVisible();
    expect(screen.getByRole("link", { name: /sourceManage/ })).toHaveAttribute(
      "href",
      "/projects/project-1/documentation/sources",
    );
  });

  it("says what the client can see, and what waits for the developer", () => {
    render(<ClientContentPage projectId="project-1" />);

    expect(screen.getByText("priority_published")).toBeVisible();
    expect(screen.getByText("visibility_current_version_visible")).toBeVisible();
  });

  // It used to announce "create your first section" above a section that
  // existed. A banner contradicting the page it sits on is worse than none.
  it("stays quiet when it would only repeat the list below it", () => {
    vi.mocked(useDocumentationWorkspace).mockReturnValue({
      data: {
        priority: "no_sections",
        clientVisibility: "nothing_published",
        releaseProgress: null,
        pendingReviewCount: 0,
        activeOperationCount: 0,
        failedOperationCount: 0,
        currentReleaseId: null,
      },
      isPending: false,
      isError: false,
    } as never);

    render(<ClientContentPage projectId="project-1" />);

    expect(screen.queryByText("priority_no_sections")).not.toBeInTheDocument();
    expect(screen.getByText("section-list")).toBeVisible();
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
      "/projects/project-1/documentation/sources",
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
