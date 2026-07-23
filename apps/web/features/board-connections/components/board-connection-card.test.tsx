import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

const mockedUseBoardConnection = vi.mocked(useBoardConnection);
const mockedUseDisconnectBoard = vi.mocked(useDisconnectBoard);

const fakeConnection = {
  provider: "github" as const,
  boardOwnerLogin: "acme",
  boardOwnerType: "Organization" as const,
  boardNumber: 3,
  boardTitle: "Roadmap",
  boardUrl: "https://github.com/orgs/acme/projects/3",
};

function stubDisconnect() {
  const mutate = vi.fn();
  mockedUseDisconnectBoard.mockReturnValue({
    mutate,
    isPending: false,
  } as unknown as ReturnType<typeof useDisconnectBoard>);
  return mutate;
}

describe("BoardConnectionCard", () => {
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

  it("disconnects the board when the disconnect button is clicked", async () => {
    mockedUseBoardConnection.mockReturnValue({
      data: fakeConnection,
      isPending: false,
    } as unknown as ReturnType<typeof useBoardConnection>);
    const mutate = stubDisconnect();
    const user = userEvent.setup();

    render(<BoardConnectionCard projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "disconnect" }));

    expect(mutate).toHaveBeenCalled();
  });
});
