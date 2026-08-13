import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClientSectionView } from "./client-section-view";

describe("ClientSectionView", () => {
  it("renders paragraphs, bullets, and explicit open points", () => {
    render(
      <ClientSectionView
        section={{
          id: "00000000-0000-4000-8000-000000000001",
          name: "Le projet",
          blocks: [
            { type: "paragraph", text: "A clear introduction" },
            { type: "bullet", text: "A concrete result" },
            {
              type: "open_point",
              text: "Delivery date to confirm",
              openPointId: "delivery-date",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("A clear introduction")).toBeVisible();
    expect(screen.getByText("A concrete result")).toBeVisible();
    expect(screen.getByText("•")).toHaveAttribute("aria-hidden", "true");
    // Escalate rather than guess: an open point is set apart by its own
    // surface — periwinkle is the only colour allowed to carry emphasis
    // (DESIGN.md, One Voice Rule) — and it is named. A box that only looks
    // different leaves the reader guessing what makes it different.
    expect(screen.getByText("Delivery date to confirm")).toBeVisible();
    expect(screen.getByText("openPointLabel")).toBeVisible();
  });
});
