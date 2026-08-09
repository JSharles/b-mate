import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNotionConnectionStatus } from "../api/notion-connection";
import { useNotionConnectionStatus } from "./use-notion-connection-status";

vi.mock("../api/notion-connection", () => ({
  getNotionConnectionStatus: vi.fn(),
}));

const mockedGetNotionConnectionStatus = vi.mocked(getNotionConnectionStatus);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("useNotionConnectionStatus", () => {
  beforeEach(() => {
    mockedGetNotionConnectionStatus.mockReset();
  });

  it("returns connected: true when the project has a Notion connection", async () => {
    mockedGetNotionConnectionStatus.mockResolvedValue({
      connected: true,
      workspaceName: "Acme Workspace",
    });

    const { result } = renderHook(() => useNotionConnectionStatus("project-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      connected: true,
      workspaceName: "Acme Workspace",
    });
    expect(mockedGetNotionConnectionStatus).toHaveBeenCalledWith("project-1");
  });

  it("returns connected: false when the project has no Notion connection", async () => {
    mockedGetNotionConnectionStatus.mockResolvedValue({
      connected: false,
      workspaceName: null,
    });

    const { result } = renderHook(() => useNotionConnectionStatus("project-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ connected: false, workspaceName: null });
  });
});
