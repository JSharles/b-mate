import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NewProjectPage from "./page";

vi.mock("@/features/projects/components/create-project-form", () => ({
  CreateProjectForm: () => <div>create-project-form</div>,
}));

describe("NewProjectPage", () => {
  it("renders the title and the create project form", () => {
    render(<NewProjectPage />);

    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("create-project-form")).toBeInTheDocument();
  });
});
