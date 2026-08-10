import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeaturesSection } from "./features-section";

describe("FeaturesSection", () => {
  it("renders both product demonstrations and three trust principles", () => {
    render(<FeaturesSection />);

    expect(screen.getByText("eyebrow")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "title" }),
    ).toBeInTheDocument();
    expect(screen.getByText("badge")).toBeInTheDocument();
    expect(screen.getByText("documentBadge")).toBeInTheDocument();
    expect(screen.getByText("classifyTitle")).toBeInTheDocument();
    expect(screen.getByText("structureTitle")).toBeInTheDocument();
    expect(screen.getByText("simplifyTitle")).toBeInTheDocument();
    expect(screen.getAllByText("sourceTitle")).toHaveLength(3);
    expect(screen.getByText("controlTitle")).toBeInTheDocument();
    expect(screen.getByText("accessTitle")).toBeInTheDocument();
    expect(screen.queryByText("comingSoonBadge")).not.toBeInTheDocument();
  });
});
