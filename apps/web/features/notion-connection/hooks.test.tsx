import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { notionConnectionStatusKey } from "@/shared/hooks/use-notion-connection-status";
import { connectNotionConnection, disconnectNotionConnection, getNotionConnection } from "./api";
import { useConnectNotionConnection, useDisconnectNotionConnection, useNotionConnection } from "./hooks";

vi.mock("./api", () => ({
  getNotionConnection: vi.fn(),
  connectNotionConnection: vi.fn(),
  disconnectNotionConnection: vi.fn(),
}));

const mockedGetNotionConnection = vi.mocked(getNotionConnection);
const mockedConnectNotionConnection = vi.mocked(connectNotionConnection);
const mockedDisconnectNotionConnection = vi.mocked(disconnectNotionConnection);

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

describe("notion-connection hooks", () => {
  it("useNotionConnection returns the current status", async () => {
    mockedGetNotionConnection.mockResolvedValue({
      connected: true,
      workspaceName: "Acme Workspace",
    });
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useNotionConnection("project-1"), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedGetNotionConnection).toHaveBeenCalledWith("project-1");
    expect(result.current.data).toEqual({
      connected: true,
      workspaceName: "Acme Workspace",
    });
  });

  it("useConnectNotionConnection invalidates the shared status query on success", async () => {
    mockedConnectNotionConnection.mockResolvedValue({
      connected: true,
      workspaceName: "Acme Workspace",
    });
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useConnectNotionConnection("project-1"), {
      wrapper: Wrapper,
    });
    act(() => {
      result.current.mutate({ token: "a-token" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedConnectNotionConnection).toHaveBeenCalledWith("project-1", {
      token: "a-token",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: notionConnectionStatusKey("project-1"),
    });
  });

  it("useDisconnectNotionConnection invalidates the shared status query on success", async () => {
    mockedDisconnectNotionConnection.mockResolvedValue(undefined);
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDisconnectNotionConnection("project-1"), {
      wrapper: Wrapper,
    });
    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedDisconnectNotionConnection).toHaveBeenCalledWith("project-1");
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: notionConnectionStatusKey("project-1"),
    });
  });
});
