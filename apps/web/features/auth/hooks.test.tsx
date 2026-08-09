import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentUserKey } from "@/shared/hooks/use-current-user";
import { login, logout, updateProfile } from "./api";
import { useLogin, useLogout, useUpdateProfile } from "./hooks";

vi.mock("./api", () => ({
  login: vi.fn(),
  logout: vi.fn(),
  updateProfile: vi.fn(),
}));

const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push }),
}));

const mockedLogin = vi.mocked(login);
const mockedLogout = vi.mocked(logout);
const mockedUpdateProfile = vi.mocked(updateProfile);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return {
    queryClient,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

const fakeUser = { id: "1", firstName: "Jean" } as never;

describe("auth hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("useLogin caches the user, redirects to /home, and clears any stale cached data from a prior session", async () => {
    mockedLogin.mockResolvedValue(fakeUser);
    const { Wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(["projects", "1"], { id: "1", title: "Someone else's project" });

    const { result } = renderHook(() => useLogin(), { wrapper: Wrapper });
    act(() => {
      result.current.mutate({ email: "jc@example.com", password: "supersecret123" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(currentUserKey)).toBe(fakeUser);
    expect(queryClient.getQueryData(["projects", "1"])).toBeUndefined();
    expect(push).toHaveBeenCalledWith("/home");
  });

  it("useLogout clears the cached user, any other cached data, and redirects to /", async () => {
    mockedLogout.mockResolvedValue({ success: true });
    const { Wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(currentUserKey, fakeUser);
    queryClient.setQueryData(["projects", "1"], { id: "1", title: "Their project" });

    const { result } = renderHook(() => useLogout(), { wrapper: Wrapper });
    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(currentUserKey)).toBeNull();
    expect(queryClient.getQueryData(["projects", "1"])).toBeUndefined();
    expect(push).toHaveBeenCalledWith("/");
  });

  it("useUpdateProfile replaces the cached user with the mutation's response", async () => {
    const updatedUser = { id: "1", firstName: "Jean", roleTitle: "Lead developer" } as never;
    mockedUpdateProfile.mockResolvedValue(updatedUser);
    const { Wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(currentUserKey, fakeUser);

    const { result } = renderHook(() => useUpdateProfile(), { wrapper: Wrapper });
    act(() => {
      result.current.mutate({ roleTitle: "Lead developer" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(currentUserKey)).toEqual(updatedUser);
  });
});
