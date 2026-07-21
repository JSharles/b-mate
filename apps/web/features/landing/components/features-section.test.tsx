import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeaturesSection } from "./features-section";

describe("FeaturesSection", () => {
  it("renders the three feature cards, including the coming-soon ones", () => {
    render(<FeaturesSection />);

    expect(screen.getByText("eyebrow")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(4);
    expect(screen.getByText("card1Title")).toBeInTheDocument();
    expect(screen.getByText("card2Title")).toBeInTheDocument();
    expect(screen.getByText("card3Title")).toBeInTheDocument();
    expect(screen.getByText("badge")).toBeInTheDocument();
    expect(screen.getAllByText("comingSoonBadge")).toHaveLength(2);
  });
});
