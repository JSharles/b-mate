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
    // An open point is set apart by its own surface, not by a second accent
    // colour — periwinkle is the only colour allowed to carry emphasis
    // (DESIGN.md, One Voice Rule).
    expect(screen.getByText("Delivery date to confirm")).toHaveClass(
      "bg-muted",
    );
    expect(screen.getByText("•")).toHaveAttribute("aria-hidden", "true");
  });
});
