import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useProject, useUpdateProject } from "../hooks";
import { ProjectPreferences } from "./project-preferences";

vi.mock("../hooks", () => ({
  useProject: vi.fn(),
  useUpdateProject: vi.fn(),
}));

const mockedUseProject = vi.mocked(useProject);
const mockedUseUpdateProject = vi.mocked(useUpdateProject);

function fakeProject(overrides: Partial<{
  timezone: string | null;
  dateFormat: string | null;
  language: string | null;
}> = {}) {
  return {
    id: "project-1",
    title: "Site vitrine client X",
    timezone: null,
    dateFormat: null,
    language: null,
    ...overrides,
  };
}

describe("ProjectPreferences", () => {
  it("shows the current timezone, date format, and language when set", () => {
    mockedUseProject.mockReturnValue({
      data: fakeProject({ timezone: "Europe/Paris", dateFormat: "dmy", language: "fr" }),
    } as unknown as ReturnType<typeof useProject>);
    mockedUseUpdateProject.mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useUpdateProject>);

    render(<ProjectPreferences projectId="project-1" />);

    expect(screen.getByText("Europe/Paris")).toBeInTheDocument();
    expect(screen.getByText("dateFormatOption.dmy")).toBeInTheDocument();
    expect(screen.getByText("languageOption.fr")).toBeInTheDocument();
  });

  it("shows placeholders when nothing has been set yet", () => {
    mockedUseProject.mockReturnValue({
      data: fakeProject(),
    } as unknown as ReturnType<typeof useProject>);
    mockedUseUpdateProject.mockReturnValue({
      mutate: vi.fn(),
    } as unknown as ReturnType<typeof useUpdateProject>);

    render(<ProjectPreferences projectId="project-1" />);

    expect(screen.getByText("timezonePlaceholder")).toBeInTheDocument();
    expect(screen.getByText("dateFormatPlaceholder")).toBeInTheDocument();
    expect(screen.getByText("languagePlaceholder")).toBeInTheDocument();
  });

  it("saves the new date format as soon as it's picked, no separate save step", async () => {
    const mutate = vi.fn();
    mockedUseProject.mockReturnValue({
      data: fakeProject(),
    } as unknown as ReturnType<typeof useProject>);
    mockedUseUpdateProject.mockReturnValue({
      mutate,
    } as unknown as ReturnType<typeof useUpdateProject>);
    const user = userEvent.setup();

    render(<ProjectPreferences projectId="project-1" />);

    // Order matches render order: timezone, date format, language.
    await user.click(screen.getAllByRole("combobox")[1]);
    await user.click(screen.getByText("dateFormatOption.ymd"));

    expect(mutate).toHaveBeenCalledWith({ dateFormat: "ymd" });
  });

  it("saves the new language as soon as it's picked", async () => {
    const mutate = vi.fn();
    mockedUseProject.mockReturnValue({
      data: fakeProject(),
    } as unknown as ReturnType<typeof useProject>);
    mockedUseUpdateProject.mockReturnValue({
      mutate,
    } as unknown as ReturnType<typeof useUpdateProject>);
    const user = userEvent.setup();

    render(<ProjectPreferences projectId="project-1" />);

    await user.click(screen.getAllByRole("combobox")[2]);
    await user.click(screen.getByText("languageOption.en"));

    expect(mutate).toHaveBeenCalledWith({ language: "en" });
  });
});
