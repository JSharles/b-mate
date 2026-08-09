import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSearchParams } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api-client";
import { useBoardConnection, useDisconnectBoard } from "../hooks";
import { BoardConnectionCard } from "./board-connection-card";

vi.mock("../hooks", () => ({
  useBoardConnection: vi.fn(),
  useDisconnectBoard: vi.fn(),
}));

vi.mock("./connect-board-dialog", () => ({
  ConnectBoardDialog: vi.fn(({ open }: { open: boolean }) => (
    <div data-testid="connect-board-dialog">{open ? "open" : "closed"}</div>
  )),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(),
}));

const mockedUseBoardConnection = vi.mocked(useBoardConnection);
const mockedUseDisconnectBoard = vi.mocked(useDisconnectBoard);
const mockedUseSearchParams = vi.mocked(useSearchParams);

function paramsWith(entries: Record<string, string> = {}) {
  return {
    get: (key: string) => entries[key] ?? null,
  } as unknown as ReturnType<typeof useSearchParams>;
}

const fakeConnection = {
  provider: "github" as const,
  boardOwnerLogin: "acme",
  boardOwnerType: "Organization" as const,
  boardNumber: 3,
  boardTitle: "Roadmap",
  boardUrl: "https://github.com/orgs/acme/projects/3",
  needsReconnect: false,
};

function stubDisconnect(overrides: Record<string, unknown> = {}) {
  const mutate = vi.fn();
  const reset = vi.fn();
  mockedUseDisconnectBoard.mockReturnValue({
    mutate,
    reset,
    isPending: false,
    isError: false,
    error: null,
    ...overrides,
  } as unknown as ReturnType<typeof useDisconnectBoard>);
  return mutate;
}

describe("BoardConnectionCard", () => {
  beforeEach(() => {
    mockedUseSearchParams.mockReturnValue(paramsWith());
  });

  it("shows a skeleton while pending", () => {
    mockedUseBoardConnection.mockReturnValue({
      data: undefined,
      isPending: true,
    } as unknown as ReturnType<typeof useBoardConnection>);
    stubDisconnect();

    const { container } = render(<BoardConnectionCard projectId="project-1" />);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(screen.queryByText("notConnected")).not.toBeInTheDocument();
  });

  it("shows the not-connected state with a way to start connecting", () => {
    mockedUseBoardConnection.mockReturnValue({
      data: null,
      isPending: false,
    } as unknown as ReturnType<typeof useBoardConnection>);
    stubDisconnect();

    render(<BoardConnectionCard projectId="project-1" />);

    expect(screen.getByText("notConnected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "connect" })).toBeInTheDocument();
  });

  it("opens the connect dialog when the connect button is clicked", async () => {
    mockedUseBoardConnection.mockReturnValue({
      data: null,
      isPending: false,
    } as unknown as ReturnType<typeof useBoardConnection>);
    stubDisconnect();
    const user = userEvent.setup();

    render(<BoardConnectionCard projectId="project-1" />);
    expect(screen.getByTestId("connect-board-dialog")).toHaveTextContent("closed");

    await user.click(screen.getByRole("button", { name: "connect" }));

    expect(screen.getByTestId("connect-board-dialog")).toHaveTextContent("open");
  });

  it("shows the connected board's name and a link to it on GitHub", () => {
    mockedUseBoardConnection.mockReturnValue({
      data: fakeConnection,
      isPending: false,
    } as unknown as ReturnType<typeof useBoardConnection>);
    stubDisconnect();

    render(<BoardConnectionCard projectId="project-1" />);

    const link = screen.getByRole("link", { name: /connectedTo/ });
    expect(link).toHaveAttribute("href", "https://github.com/orgs/acme/projects/3");
    expect(screen.queryByRole("button", { name: "connect" })).not.toBeInTheDocument();
  });

  it("opens the connect dialog automatically when the URL has connectBoard=1", () => {
    mockedUseSearchParams.mockReturnValue(paramsWith({ connectBoard: "1" }));
    mockedUseBoardConnection.mockReturnValue({
      data: null,
      isPending: false,
    } as unknown as ReturnType<typeof useBoardConnection>);
    stubDisconnect();

    render(<BoardConnectionCard projectId="project-1" />);

    expect(screen.getByTestId("connect-board-dialog")).toHaveTextContent("open");
  });

  it("shows a reconnect prompt instead of the normal connected state when needsReconnect is true", async () => {
    mockedUseBoardConnection.mockReturnValue({
      data: { ...fakeConnection, needsReconnect: true },
      isPending: false,
    } as unknown as ReturnType<typeof useBoardConnection>);
    stubDisconnect();
    const user = userEvent.setup();

    render(<BoardConnectionCard projectId="project-1" />);

    expect(screen.getByText("needsReconnect")).toBeInTheDocument();
    expect(screen.getByTestId("connect-board-dialog")).toHaveTextContent("closed");

    await user.click(screen.getByRole("button", { name: "reconnect" }));

    expect(screen.getByTestId("connect-board-dialog")).toHaveTextContent("open");
  });

  it("asks for confirmation before disconnecting, and does not disconnect on its own", async () => {
    mockedUseBoardConnection.mockReturnValue({
      data: fakeConnection,
      isPending: false,
    } as unknown as ReturnType<typeof useBoardConnection>);
    const mutate = stubDisconnect();
    const user = userEvent.setup();

    render(<BoardConnectionCard projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "disconnect" }));

    expect(screen.getByText("disconnectConfirmTitle")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("disconnects the board only after confirming in the alert dialog", async () => {
    mockedUseBoardConnection.mockReturnValue({
      data: fakeConnection,
      isPending: false,
    } as unknown as ReturnType<typeof useBoardConnection>);
    const mutate = stubDisconnect();
    const user = userEvent.setup();

    render(<BoardConnectionCard projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "disconnect" }));
    await user.click(screen.getByRole("button", { name: "disconnectConfirmAction" }));

    expect(mutate).toHaveBeenCalled();
  });

  it("closes the confirmation dialog only once the disconnect mutation succeeds", async () => {
    mockedUseBoardConnection.mockReturnValue({
      data: fakeConnection,
      isPending: false,
    } as unknown as ReturnType<typeof useBoardConnection>);
    stubDisconnect({
      mutate: vi.fn((_data: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.()),
    });
    const user = userEvent.setup();

    render(<BoardConnectionCard projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "disconnect" }));
    expect(screen.getByText("disconnectConfirmTitle")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "disconnectConfirmAction" }));

    expect(screen.queryByText("disconnectConfirmTitle")).not.toBeInTheDocument();
  });

  it("keeps the confirmation open and shows the error when the disconnect mutation fails", async () => {
    mockedUseBoardConnection.mockReturnValue({
      data: fakeConnection,
      isPending: false,
    } as unknown as ReturnType<typeof useBoardConnection>);
    stubDisconnect({ isError: true, error: new ApiError("GitHub rejected the request", 502) });
    const user = userEvent.setup();

    render(<BoardConnectionCard projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "disconnect" }));

    expect(screen.getByText("disconnectConfirmTitle")).toBeInTheDocument();
    expect(screen.getByText("GitHub rejected the request")).toBeInTheDocument();
  });

  it("does not disconnect the board when the confirmation is cancelled", async () => {
    mockedUseBoardConnection.mockReturnValue({
      data: fakeConnection,
      isPending: false,
    } as unknown as ReturnType<typeof useBoardConnection>);
    const mutate = stubDisconnect();
    const user = userEvent.setup();

    render(<BoardConnectionCard projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "disconnect" }));
    await user.click(screen.getByRole("button", { name: "disconnectConfirmCancel" }));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.queryByText("disconnectConfirmTitle")).not.toBeInTheDocument();
  });

  it("disables Cancel and blocks Escape while the disconnect mutation is pending, so a running request always has somewhere to report to", async () => {
    mockedUseBoardConnection.mockReturnValue({
      data: fakeConnection,
      isPending: false,
    } as unknown as ReturnType<typeof useBoardConnection>);
    stubDisconnect();
    const user = userEvent.setup();

    const { rerender } = render(<BoardConnectionCard projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "disconnect" }));
    expect(screen.getByText("disconnectConfirmTitle")).toBeInTheDocument();

    // Simulate the mutation now being in flight (reset() cannot cancel the
    // underlying request, so Cancel and Escape must stay blocked for as
    // long as isPending is true, not just the Action button).
    stubDisconnect({ isPending: true });
    rerender(<BoardConnectionCard projectId="project-1" />);

    expect(screen.getByRole("button", { name: "disconnectConfirmCancel" })).toBeDisabled();

    await user.keyboard("{Escape}");

    expect(screen.getByText("disconnectConfirmTitle")).toBeInTheDocument();
  });
});
