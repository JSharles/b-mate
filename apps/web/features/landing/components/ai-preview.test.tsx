import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiPreview } from "./ai-preview";

describe("AiPreview", () => {
  it("renders the source issue and its client-friendly rewrite", () => {
    render(<AiPreview />);

    expect(screen.getByText("badge")).toBeInTheDocument();
    expect(screen.getByText("sourceLabel")).toBeInTheDocument();
    expect(screen.getByText("sourceTitle")).toBeInTheDocument();
    expect(screen.getByText("clientLabel")).toBeInTheDocument();
    expect(screen.getByText("clientTitle")).toBeInTheDocument();
    expect(screen.getByText("why")).toBeInTheDocument();
    expect(screen.getByText("impact")).toBeInTheDocument();
    expect(screen.getByText("state")).toBeInTheDocument();
  });
});
