import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FaqSection } from "./faq-section";

describe("FaqSection", () => {
  it("renders every question and its answer inside a disclosure", () => {
    render(<FaqSection />);

    expect(screen.getByText("eyebrow")).toBeInTheDocument();

    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(`q${i}`)).toBeInTheDocument();
      expect(screen.getByText(`a${i}`)).toBeInTheDocument();
    }
  });
});
