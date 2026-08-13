import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SourceDocument } from "schemas";
import { DocumentStatus } from "./document-status";

describe("DocumentStatus", () => {
  it.each([
    ["incorporated", "statusIncorporated"],
    ["failed", "statusFailed"],
    ["removed", "statusRemoved"],
  ] as const)("maps %s to an unambiguous visible state", (status, label) => {
    render(<DocumentStatus status={status as SourceDocument["status"]} />);

    expect(screen.getByText(label)).toBeVisible();
  });

  // A document is read once at upload and then it is in. Nothing runs behind
  // it, so there is no spinner to hold and no elapsed time to explain.
  it("never spins: nothing is running behind a document", () => {
    const { container } = render(<DocumentStatus status="incorporated" />);

    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  // An unrecognised status used to render as a green check and "intégré à la
  // source" — wrong, and reassuring about it.
  it("says so rather than reassuring, when the status is not one it knows", () => {
    render(
      <DocumentStatus status={"received" as SourceDocument["status"]} />,
    );

    expect(screen.getByText("statusUnavailable")).toBeVisible();
  });

  // A document list polls. A live region per row meant fifty polite
  // announcements with no way to tell which document changed — the text is a
  // label on its row, not an interruption.
  it("does not turn every row into a live region", () => {
    const { container } = render(<DocumentStatus status="incorporated" />);

    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector("[aria-live]")).toBeNull();
  });
});
