import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/api-client";
import { getMe } from "../api/auth";
import { useCurrentUser } from "./use-current-user";

vi.mock("../api/auth", () => ({
  getMe: vi.fn(),
}));

const mockedGetMe = vi.mocked(getMe);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useCurrentUser", () => {
  beforeEach(() => {
    mockedGetMe.mockReset();
  });

  it("returns the user when authenticated", async () => {
    mockedGetMe.mockResolvedValue({ id: "1", firstName: "Jean" } as never);

    const { result } = renderHook(() => useCurrentUser(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ id: "1" });
  });

  it("returns null (not an error) on a 401", async () => {
    mockedGetMe.mockRejectedValue(new ApiError("Not authenticated", 401));

    const { result } = renderHook(() => useCurrentUser(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("surfaces non-401 failures as real errors", async () => {
    mockedGetMe.mockRejectedValue(new ApiError("Server error", 500));

    const { result } = renderHook(() => useCurrentUser(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
