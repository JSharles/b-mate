import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClientCategoryView } from "./client-category-view";

describe("ClientCategoryView", () => {
  it("renders paragraphs, bullets, and explicit open points", () => {
    render(
      <ClientCategoryView
        category={{
          categoryKey: "overview",
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
    expect(screen.getByText("Delivery date to confirm")).toHaveClass(
      "text-amber-100",
    );
    expect(screen.getByText("•")).toHaveAttribute("aria-hidden", "true");
  });
});
