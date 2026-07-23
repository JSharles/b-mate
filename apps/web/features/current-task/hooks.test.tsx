import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { getCurrentTask } from "./api";
import { useCurrentTask } from "./hooks";

vi.mock("./api", () => ({
  getCurrentTask: vi.fn(),
}));

const mockedGetCurrentTask = vi.mocked(getCurrentTask);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    Wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

describe("useCurrentTask", () => {
  it("returns the current task items for the project", async () => {
    const items = [{ title: "Fix bug", description: "Details", url: null }];
    mockedGetCurrentTask.mockResolvedValue(items);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useCurrentTask("project-1"), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedGetCurrentTask).toHaveBeenCalledWith("project-1");
    expect(result.current.data).toEqual(items);
  });
});
