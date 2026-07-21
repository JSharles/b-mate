import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HomePage from "./page";

vi.mock("@/features/projects/components/project-list", () => ({
  ProjectList: () => <div>project-list</div>,
}));

describe("HomePage", () => {
  it("renders the project list", () => {
    render(<HomePage />);

    expect(screen.getByText("project-list")).toBeInTheDocument();
  });
});
