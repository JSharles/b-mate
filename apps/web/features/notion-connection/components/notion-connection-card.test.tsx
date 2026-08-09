import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api-client";
import { useDisconnectNotionConnection, useNotionConnection } from "../hooks";
import { NotionConnectionCard } from "./notion-connection-card";

vi.mock("../hooks", () => ({
  useNotionConnection: vi.fn(),
  useDisconnectNotionConnection: vi.fn(),
}));

vi.mock("./connect-notion-dialog", () => ({
  ConnectNotionDialog: vi.fn(({ open }: { open: boolean }) => (
    <div data-testid="connect-notion-dialog">{open ? "open" : "closed"}</div>
  )),
}));

const mockedUseNotionConnection = vi.mocked(useNotionConnection);
const mockedUseDisconnectNotionConnection = vi.mocked(useDisconnectNotionConnection);

function stubDisconnect(overrides: Record<string, unknown> = {}) {
  const mutate = vi.fn();
  const reset = vi.fn();
  mockedUseDisconnectNotionConnection.mockReturnValue({
    mutate,
    reset,
    isPending: false,
    isError: false,
    error: null,
    ...overrides,
  } as unknown as ReturnType<typeof useDisconnectNotionConnection>);
  return mutate;
}

describe("NotionConnectionCard", () => {
  beforeEach(() => {
    stubDisconnect();
  });

  it("shows a skeleton while pending", () => {
    mockedUseNotionConnection.mockReturnValue({
      data: undefined,
      isPending: true,
    } as unknown as ReturnType<typeof useNotionConnection>);

    const { container } = render(<NotionConnectionCard projectId="project-1" />);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(screen.queryByText("notConnected")).not.toBeInTheDocument();
  });

  it("shows the not-connected state with a way to start connecting", () => {
    mockedUseNotionConnection.mockReturnValue({
      data: { connected: false, workspaceName: null },
      isPending: false,
    } as unknown as ReturnType<typeof useNotionConnection>);

    render(<NotionConnectionCard projectId="project-1" />);

    expect(screen.getByText("notConnected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "connect" })).toBeInTheDocument();
  });

  it("opens the connect dialog when the connect button is clicked", async () => {
    mockedUseNotionConnection.mockReturnValue({
      data: { connected: false, workspaceName: null },
      isPending: false,
    } as unknown as ReturnType<typeof useNotionConnection>);
    const user = userEvent.setup();

    render(<NotionConnectionCard projectId="project-1" />);
    expect(screen.getByTestId("connect-notion-dialog")).toHaveTextContent("closed");

    await user.click(screen.getByRole("button", { name: "connect" }));

    expect(screen.getByTestId("connect-notion-dialog")).toHaveTextContent("open");
  });

  it("shows the connected workspace name, with reconnect and disconnect actions", () => {
    mockedUseNotionConnection.mockReturnValue({
      data: { connected: true, workspaceName: "Acme Workspace" },
      isPending: false,
    } as unknown as ReturnType<typeof useNotionConnection>);

    render(<NotionConnectionCard projectId="project-1" />);

    expect(screen.getByText("connectedTo")).toBeInTheDocument();
    expect(screen.queryByText("connected")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "reconnect" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "disconnect" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "connect" })).not.toBeInTheDocument();
  });

  it("falls back to the generic 'connected' label when no workspace name is stored", () => {
    mockedUseNotionConnection.mockReturnValue({
      data: { connected: true, workspaceName: null },
      isPending: false,
    } as unknown as ReturnType<typeof useNotionConnection>);

    render(<NotionConnectionCard projectId="project-1" />);

    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("opens the connect dialog when reconnect is clicked", async () => {
    mockedUseNotionConnection.mockReturnValue({
      data: { connected: true, workspaceName: "Acme Workspace" },
      isPending: false,
    } as unknown as ReturnType<typeof useNotionConnection>);
    const user = userEvent.setup();

    render(<NotionConnectionCard projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "reconnect" }));

    expect(screen.getByTestId("connect-notion-dialog")).toHaveTextContent("open");
  });

  it("asks for confirmation before disconnecting, and does not disconnect on its own", async () => {
    mockedUseNotionConnection.mockReturnValue({
      data: { connected: true, workspaceName: "Acme Workspace" },
      isPending: false,
    } as unknown as ReturnType<typeof useNotionConnection>);
    const mutate = stubDisconnect();
    const user = userEvent.setup();

    render(<NotionConnectionCard projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "disconnect" }));

    expect(screen.getByText("disconnectConfirmTitle")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("disconnects only after confirming in the alert dialog", async () => {
    mockedUseNotionConnection.mockReturnValue({
      data: { connected: true, workspaceName: "Acme Workspace" },
      isPending: false,
    } as unknown as ReturnType<typeof useNotionConnection>);
    const mutate = stubDisconnect();
    const user = userEvent.setup();

    render(<NotionConnectionCard projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "disconnect" }));
    await user.click(screen.getByRole("button", { name: "disconnectConfirmAction" }));

    expect(mutate).toHaveBeenCalled();
  });

  it("closes the confirmation dialog only once the disconnect mutation succeeds", async () => {
    mockedUseNotionConnection.mockReturnValue({
      data: { connected: true, workspaceName: "Acme Workspace" },
      isPending: false,
    } as unknown as ReturnType<typeof useNotionConnection>);
    stubDisconnect({
      mutate: vi.fn((_data: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.()),
    });
    const user = userEvent.setup();

    render(<NotionConnectionCard projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "disconnect" }));
    expect(screen.getByText("disconnectConfirmTitle")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "disconnectConfirmAction" }));

    expect(screen.queryByText("disconnectConfirmTitle")).not.toBeInTheDocument();
  });

  it("keeps the confirmation open and shows the error when the disconnect mutation fails", async () => {
    mockedUseNotionConnection.mockReturnValue({
      data: { connected: true, workspaceName: "Acme Workspace" },
      isPending: false,
    } as unknown as ReturnType<typeof useNotionConnection>);
    stubDisconnect({ isError: true, error: new ApiError("Notion rejected the request", 502) });
    const user = userEvent.setup();

    render(<NotionConnectionCard projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "disconnect" }));

    expect(screen.getByText("disconnectConfirmTitle")).toBeInTheDocument();
    expect(screen.getByText("Notion rejected the request")).toBeInTheDocument();
  });

  it("does not disconnect when the confirmation is cancelled", async () => {
    mockedUseNotionConnection.mockReturnValue({
      data: { connected: true, workspaceName: "Acme Workspace" },
      isPending: false,
    } as unknown as ReturnType<typeof useNotionConnection>);
    const mutate = stubDisconnect();
    const user = userEvent.setup();

    render(<NotionConnectionCard projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "disconnect" }));
    await user.click(screen.getByRole("button", { name: "disconnectConfirmCancel" }));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.queryByText("disconnectConfirmTitle")).not.toBeInTheDocument();
  });

  it("disables Cancel and blocks Escape while the disconnect mutation is pending, so a running request always has somewhere to report to", async () => {
    mockedUseNotionConnection.mockReturnValue({
      data: { connected: true, workspaceName: "Acme Workspace" },
      isPending: false,
    } as unknown as ReturnType<typeof useNotionConnection>);
    stubDisconnect();
    const user = userEvent.setup();

    const { rerender } = render(<NotionConnectionCard projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "disconnect" }));
    expect(screen.getByText("disconnectConfirmTitle")).toBeInTheDocument();

    // Simulate the mutation now being in flight (reset() cannot cancel the
    // underlying request, so Cancel and Escape must stay blocked for as
    // long as isPending is true, not just the Action button).
    stubDisconnect({ isPending: true });
    rerender(<NotionConnectionCard projectId="project-1" />);

    expect(screen.getByRole("button", { name: "disconnectConfirmCancel" })).toBeDisabled();

    await user.keyboard("{Escape}");

    expect(screen.getByText("disconnectConfirmTitle")).toBeInTheDocument();
  });
});
