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
  it("returns the current task items for the project, requesting the active locale", async () => {
    const items = [
      {
        title: "Fix bug",
        why: "Details",
        impact: null,
        status: null,
        updatedAt: "2026-07-20T10:00:00.000Z",
        startedAt: "2026-07-18T10:00:00.000Z",
        estimatedCompletionAt: null,
        estimateConfidence: null,
      },
    ];
    mockedGetCurrentTask.mockResolvedValue(items);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useCurrentTask("project-1"), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedGetCurrentTask).toHaveBeenCalledWith("project-1", "fr");
    expect(result.current.data).toEqual(items);
  });
});
