import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DocumentPreview } from "./document-preview";

describe("DocumentPreview", () => {
  it("renders the source, three transformations, categories, and review control", () => {
    render(<DocumentPreview />);

    expect(screen.getByText("documentBadge")).toBeInTheDocument();
    expect(screen.getByText("sourceTitle")).toBeInTheDocument();
    expect(screen.getByText("classifyTitle")).toBeInTheDocument();
    expect(screen.getByText("structureTitle")).toBeInTheDocument();
    expect(screen.getByText("simplifyTitle")).toBeInTheDocument();
    expect(screen.getByText("projectCategory")).toBeInTheDocument();
    expect(screen.getByText("howCategory")).toBeInTheDocument();
    expect(screen.getByText("roadmapCategory")).toBeInTheDocument();
    expect(screen.getByText("otherCategory")).toBeInTheDocument();
    expect(screen.getByText("controlText")).toBeInTheDocument();
  });
});
