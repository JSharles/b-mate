import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  connectBoard,
  disconnectBoard,
  getBoardConnection,
  previewBoardConnection,
} from "./api";
import {
  boardConnectionKey,
  useBoardConnection,
  useConnectBoard,
  useDisconnectBoard,
  usePreviewBoardConnection,
} from "./hooks";

vi.mock("./api", () => ({
  getBoardConnection: vi.fn(),
  previewBoardConnection: vi.fn(),
  connectBoard: vi.fn(),
  disconnectBoard: vi.fn(),
}));

const mockedGetBoardConnection = vi.mocked(getBoardConnection);
const mockedPreviewBoardConnection = vi.mocked(previewBoardConnection);
const mockedConnectBoard = vi.mocked(connectBoard);
const mockedDisconnectBoard = vi.mocked(disconnectBoard);

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

const fakeBoard = {
  ownerLogin: "acme",
  ownerType: "Organization" as const,
  number: 3,
  title: "Roadmap",
  url: "https://github.com/orgs/acme/projects/3",
};

const fakeConnection = {
  provider: "github" as const,
  boardOwnerLogin: "acme",
  boardOwnerType: "Organization" as const,
  boardNumber: 3,
  boardTitle: "Roadmap",
  boardUrl: "https://github.com/orgs/acme/projects/3",
};

describe("board-connections hooks", () => {
  it("useBoardConnection returns the current connection", async () => {
    mockedGetBoardConnection.mockResolvedValue(fakeConnection);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => useBoardConnection("project-1"), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedGetBoardConnection).toHaveBeenCalledWith("project-1");
    expect(result.current.data).toEqual(fakeConnection);
  });

  it("usePreviewBoardConnection returns the available boards", async () => {
    mockedPreviewBoardConnection.mockResolvedValue([fakeBoard]);
    const { Wrapper } = createWrapper();

    const { result } = renderHook(() => usePreviewBoardConnection("project-1"), {
      wrapper: Wrapper,
    });
    act(() => {
      result.current.mutate({ token: "a-token" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedPreviewBoardConnection).toHaveBeenCalledWith("project-1", { token: "a-token" });
    expect(result.current.data).toEqual([fakeBoard]);
  });

  it("useConnectBoard invalidates the board-connection query on success", async () => {
    mockedConnectBoard.mockResolvedValue(fakeConnection);
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useConnectBoard("project-1"), { wrapper: Wrapper });
    act(() => {
      result.current.mutate({
        token: "a-token",
        ownerLogin: "acme",
        ownerType: "Organization",
        number: 3,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: boardConnectionKey("project-1") });
  });

  it("useDisconnectBoard invalidates the board-connection query on success", async () => {
    mockedDisconnectBoard.mockResolvedValue(undefined);
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDisconnectBoard("project-1"), { wrapper: Wrapper });
    act(() => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedDisconnectBoard).toHaveBeenCalledWith("project-1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: boardConnectionKey("project-1") });
  });
});
