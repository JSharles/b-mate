import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeaturesSection } from "./features-section";

describe("FeaturesSection", () => {
  it("renders the four feature cards", () => {
    render(<FeaturesSection />);

    expect(screen.getByText("eyebrow")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(4);
    expect(screen.getByText("card1Title")).toBeInTheDocument();
    expect(screen.getByText("card4Title")).toBeInTheDocument();
  });
});
