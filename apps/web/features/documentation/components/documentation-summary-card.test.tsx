import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDocumentationWorkspace } from "../hooks";
import { DocumentationSummaryCard } from "./documentation-summary-card";

vi.mock("../hooks", () => ({ useDocumentationWorkspace: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("DocumentationSummaryCard", () => {
  it.each(["needs_action", "needs_attention", "processing", "published"] as const)(
    "links the project summary to the dedicated page for %s",
    (priority) => {
      vi.mocked(useDocumentationWorkspace).mockReturnValue({
        data: { priority },
      } as never);

      render(<DocumentationSummaryCard projectId="project-1" />);

      // The card reports the pipeline's priority, so it has to lead to the
      // pipeline — the document inventory cannot answer "what needs me".
      expect(screen.getByRole("link")).toHaveAttribute(
        "href",
        "/projects/project-1/documentation",
      );
      expect(screen.getByText(`priority_${priority}`)).toBeVisible();
    },
  );
});
