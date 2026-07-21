import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AiPreview } from "./ai-preview";

describe("AiPreview", () => {
  it("renders the coming soon badge and both board columns", () => {
    render(<AiPreview />);

    expect(screen.getByText("badge")).toBeInTheDocument();
    expect(screen.getByText("heading")).toBeInTheDocument();
    expect(screen.getByText("devBoardLabel")).toBeInTheDocument();
    expect(screen.getByText("clientViewLabel")).toBeInTheDocument();
    expect(screen.getByText("ticket1")).toBeInTheDocument();
    expect(screen.getByText("translated1")).toBeInTheDocument();
  });
});
