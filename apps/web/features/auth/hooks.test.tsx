import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentUserKey } from "@/shared/hooks/use-current-user";
import { login, logout, signup } from "./api";
import { useLogin, useLogout, useSignup } from "./hooks";

vi.mock("./api", () => ({
  signup: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push }),
}));

const mockedSignup = vi.mocked(signup);
const mockedLogin = vi.mocked(login);
const mockedLogout = vi.mocked(logout);

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

  it("useSignup caches the user and redirects to /home", async () => {
    mockedSignup.mockResolvedValue(fakeUser);
    const { Wrapper, queryClient } = createWrapper();

    const { result } = renderHook(() => useSignup(), { wrapper: Wrapper });
    act(() => {
      result.current.mutate({
        firstName: "Jean",
        lastName: "Charles",
        email: "jc@example.com",
        password: "supersecret123",
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(currentUserKey)).toBe(fakeUser);
    expect(push).toHaveBeenCalledWith("/home");
  });

  it("useLogin caches the user and redirects to /home", async () => {
    mockedLogin.mockResolvedValue(fakeUser);
    const { Wrapper, queryClient } = createWrapper();

    const { result } = renderHook(() => useLogin(), { wrapper: Wrapper });
    act(() => {
      result.current.mutate({ email: "jc@example.com", password: "supersecret123" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(currentUserKey)).toBe(fakeUser);
    expect(push).toHaveBeenCalledWith("/home");
  });

  it("useLogout clears the cached user and redirects to /", async () => {
    mockedLogout.mockResolvedValue({ success: true });
    const { Wrapper, queryClient } = createWrapper();
    queryClient.setQueryData(currentUserKey, fakeUser);

    const { result } = renderHook(() => useLogout(), { wrapper: Wrapper });
    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(currentUserKey)).toBeNull();
    expect(push).toHaveBeenCalledWith("/");
  });
});
