import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CreateProjectForm } from "./create-project-form";
import { CreateProjectDialog } from "./create-project-dialog";

vi.mock("./create-project-form", () => ({
  CreateProjectForm: vi.fn(() => <div>create-project-form</div>),
}));

const mockedCreateProjectForm = vi.mocked(CreateProjectForm);

describe("CreateProjectDialog", () => {
  beforeEach(() => {
    mockedCreateProjectForm.mockClear();
  });

  it("renders the title and form when open", () => {
    render(<CreateProjectDialog open onOpenChange={vi.fn()} />);

    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("create-project-form")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(<CreateProjectDialog open={false} onOpenChange={vi.fn()} />);

    expect(screen.queryByText("create-project-form")).not.toBeInTheDocument();
  });

  it("closes itself once the form reports a project was created", () => {
    const onOpenChange = vi.fn();
    render(<CreateProjectDialog open onOpenChange={onOpenChange} />);

    const props = mockedCreateProjectForm.mock.calls[0][0];
    props.onCreated?.();

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
