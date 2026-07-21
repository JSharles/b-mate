import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProject, getProject, listProjects } from "./api";
import { projectsKey, useCreateProject, useProject, useProjects } from "./hooks";

vi.mock("./api", () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  getProject: vi.fn(),
}));

const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push }),
}));

const mockedListProjects = vi.mocked(listProjects);
const mockedCreateProject = vi.mocked(createProject);
const mockedGetProject = vi.mocked(getProject);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

const fakeProject = { id: "1", title: "My project" } as never;

describe("projects hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("useProjects returns the list of projects", async () => {
    mockedListProjects.mockResolvedValue([fakeProject]);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useProjects(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([fakeProject]);
  });

  it("useProject returns the single project", async () => {
    mockedGetProject.mockResolvedValue(fakeProject);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useProject("1"), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedGetProject).toHaveBeenCalledWith("1");
    expect(result.current.data).toEqual(fakeProject);
  });

  it("useCreateProject invalidates the projects query and redirects to /home", async () => {
    mockedCreateProject.mockResolvedValue(fakeProject);
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useCreateProject(), { wrapper: Wrapper });
    act(() => {
      result.current.mutate({ title: "My project" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectsKey });
    expect(push).toHaveBeenCalledWith("/home");
  });
});
