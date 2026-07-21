import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProject, getProject, listProjectMembers, listProjects, removeProjectMember } from "./api";
import {
  projectMembersKey,
  projectsKey,
  useCreateProject,
  useProject,
  useProjectMembers,
  useProjects,
  useRemoveMember,
} from "./hooks";

vi.mock("./api", () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  getProject: vi.fn(),
  listProjectMembers: vi.fn(),
  removeProjectMember: vi.fn(),
}));

const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push }),
}));

const mockedListProjects = vi.mocked(listProjects);
const mockedCreateProject = vi.mocked(createProject);
const mockedGetProject = vi.mocked(getProject);
const mockedListProjectMembers = vi.mocked(listProjectMembers);
const mockedRemoveProjectMember = vi.mocked(removeProjectMember);

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

  it("useProjectMembers returns the project's members", async () => {
    const members = [
      { userId: "user-2", firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", isAdmin: false },
    ] as never;
    mockedListProjectMembers.mockResolvedValue(members);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useProjectMembers("project-1"), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedListProjectMembers).toHaveBeenCalledWith("project-1");
    expect(result.current.data).toEqual(members);
  });

  it("useRemoveMember invalidates the members query for the project", async () => {
    mockedRemoveProjectMember.mockResolvedValue(undefined);
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useRemoveMember("project-1"), { wrapper: Wrapper });
    act(() => {
      result.current.mutate("user-2");
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRemoveProjectMember).toHaveBeenCalledWith("project-1", "user-2");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: projectMembersKey("project-1") });
  });
});
