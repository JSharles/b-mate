import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api-client";
import { useCreateProject } from "../hooks";
import { CreateProjectForm } from "./create-project-form";

vi.mock("../hooks", () => ({
  useCreateProject: vi.fn(),
}));

const mockedUseCreateProject = vi.mocked(useCreateProject);

function baseMutation() {
  return {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useCreateProject>;
}

describe("CreateProjectForm", () => {
  beforeEach(() => {
    mockedUseCreateProject.mockReturnValue(baseMutation());
  });

  it("submits the title when valid", async () => {
    const mutation = baseMutation();
    mockedUseCreateProject.mockReturnValue(mutation);
    const user = userEvent.setup();

    render(<CreateProjectForm />);
    await user.type(screen.getByLabelText("title"), "My project");
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mutation.mutate).toHaveBeenCalledWith({ title: "My project" });
  });

  it("does not submit when the title is empty", async () => {
    const mutation = baseMutation();
    mockedUseCreateProject.mockReturnValue(mutation);
    const user = userEvent.setup();

    render(<CreateProjectForm />);
    await user.click(screen.getByRole("button", { name: "submit" }));

    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it("shows the API error message inline when the mutation fails", () => {
    mockedUseCreateProject.mockReturnValue({
      ...baseMutation(),
      isError: true,
      error: new ApiError("Title is required", 400),
    } as unknown as ReturnType<typeof useCreateProject>);

    render(<CreateProjectForm />);

    expect(screen.getByText("Title is required")).toBeInTheDocument();
  });

  it("disables the submit button while pending", () => {
    mockedUseCreateProject.mockReturnValue({
      ...baseMutation(),
      isPending: true,
    } as unknown as ReturnType<typeof useCreateProject>);

    render(<CreateProjectForm />);

    expect(screen.getByRole("button", { name: "submitPending" })).toBeDisabled();
  });
});
