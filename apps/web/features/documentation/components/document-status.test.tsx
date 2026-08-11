import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SourceDocument } from "schemas";
import { DocumentStatus } from "./document-status";

describe("DocumentStatus", () => {
  it.each([
    ["received", "statusProcessing", true],
    ["retrying", "statusProcessing", true],
    ["removal_pending", "statusRemoving", true],
    ["failed", "statusFailed", false],
    ["removal_failed", "statusRemovalFailed", false],
    ["removed", "statusRemoved", false],
    ["incorporated", "statusIncorporated", false],
  ] as const)("maps %s to an unambiguous visible state", (status, label, spins) => {
    const { container } = render(
      <DocumentStatus status={status as SourceDocument["status"]} />,
    );

    expect(screen.getByText(label)).toBeVisible();
    expect(Boolean(container.querySelector(".animate-spin"))).toBe(spins);
  });

  // A document list polls every 3s. A live region per row meant fifty polite
  // announcements of "Intégration en cours" with no way to tell which document
  // changed — the text is a label on its row, not an interruption.
  it("does not turn every row into a live region", () => {
    const { container } = render(<DocumentStatus status="extracting" />);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector("[aria-live]")).toBeNull();
  });
});
