import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BenefitsSection } from "./benefits-section";

describe("BenefitsSection", () => {
  it("renders both tracks with their three cards each", () => {
    render(<BenefitsSection />);

    expect(screen.getAllByText("eyebrow")).toHaveLength(2);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(6);
    expect(screen.getAllByText("card1Title")).toHaveLength(2);
    expect(screen.getAllByText("card2Title")).toHaveLength(2);
    expect(screen.getAllByText("card3Title")).toHaveLength(2);
  });
});
