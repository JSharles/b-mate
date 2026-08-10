import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingFooter } from "./landing-footer";

describe("LandingFooter", () => {
  it("renders the brand statement and launch status", () => {
    render(<LandingFooter />);

    expect(screen.getByText("Diaphane")).toBeInTheDocument();
    expect(screen.getByText("statement")).toBeInTheDocument();
    expect(screen.getByText("status")).toBeInTheDocument();
  });
});
