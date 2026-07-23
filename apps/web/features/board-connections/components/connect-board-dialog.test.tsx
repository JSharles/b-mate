import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api-client";
import { useConnectBoard, usePreviewBoardConnection } from "../hooks";
import { ConnectBoardDialog } from "./connect-board-dialog";

vi.mock("../hooks", () => ({
  usePreviewBoardConnection: vi.fn(),
  useConnectBoard: vi.fn(),
}));

const mockedUsePreview = vi.mocked(usePreviewBoardConnection);
const mockedUseConnect = vi.mocked(useConnectBoard);

const fakeBoard = {
  ownerLogin: "acme",
  ownerType: "Organization" as const,
  number: 3,
  title: "Roadmap",
  url: "https://github.com/orgs/acme/projects/3",
};

function baseMutation() {
  return {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof usePreviewBoardConnection>;
}

describe("ConnectBoardDialog", () => {
  beforeEach(() => {
    mockedUsePreview.mockReturnValue(baseMutation());
    mockedUseConnect.mockReturnValue(
      baseMutation() as unknown as ReturnType<typeof useConnectBoard>,
    );
  });

  it("shows a hint explaining what kind of token to create, with a link to GitHub", () => {
    render(<ConnectBoardDialog projectId="project-1" open={true} onOpenChange={() => {}} />);

    expect(screen.getByText("tokenHint")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "tokenHintLink" })).toHaveAttribute(
      "href",
      "https://github.com/settings/tokens/new?scopes=project&description=b-mate",
    );
  });

  it("submits the pasted token to preview", async () => {
    const preview = baseMutation();
    mockedUsePreview.mockReturnValue(preview);
    const user = userEvent.setup();

    render(<ConnectBoardDialog projectId="project-1" open={true} onOpenChange={() => {}} />);
    await user.type(screen.getByLabelText("tokenLabel"), "a-token");
    await user.click(screen.getByRole("button", { name: "previewSubmit" }));

    expect(preview.mutate).toHaveBeenCalledWith(
      { token: "a-token" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("shows the boards from a successful preview and lets the developer pick one", async () => {
    const preview = baseMutation();
    (preview.mutate as ReturnType<typeof vi.fn>).mockImplementation(
      (_vars: unknown, options: { onSuccess: (boards: unknown) => void }) => {
        options.onSuccess([fakeBoard]);
      },
    );
    mockedUsePreview.mockReturnValue(preview);
    const user = userEvent.setup();

    render(<ConnectBoardDialog projectId="project-1" open={true} onOpenChange={() => {}} />);
    await user.type(screen.getByLabelText("tokenLabel"), "a-token");
    await user.click(screen.getByRole("button", { name: "previewSubmit" }));

    expect(screen.getByRole("button", { name: /acme.*Roadmap/ })).toBeInTheDocument();
  });

  it("shows a message when the token has no accessible boards", async () => {
    const preview = baseMutation();
    (preview.mutate as ReturnType<typeof vi.fn>).mockImplementation(
      (_vars: unknown, options: { onSuccess: (boards: unknown) => void }) => {
        options.onSuccess([]);
      },
    );
    mockedUsePreview.mockReturnValue(preview);
    const user = userEvent.setup();

    render(<ConnectBoardDialog projectId="project-1" open={true} onOpenChange={() => {}} />);
    await user.type(screen.getByLabelText("tokenLabel"), "a-token");
    await user.click(screen.getByRole("button", { name: "previewSubmit" }));

    expect(screen.getByText("noBoards")).toBeInTheDocument();
  });

  it("connects the selected board when confirmed", async () => {
    const preview = baseMutation();
    (preview.mutate as ReturnType<typeof vi.fn>).mockImplementation(
      (_vars: unknown, options: { onSuccess: (boards: unknown) => void }) => {
        options.onSuccess([fakeBoard]);
      },
    );
    mockedUsePreview.mockReturnValue(preview);
    const connect = baseMutation();
    mockedUseConnect.mockReturnValue(connect as unknown as ReturnType<typeof useConnectBoard>);
    const user = userEvent.setup();

    render(<ConnectBoardDialog projectId="project-1" open={true} onOpenChange={() => {}} />);
    await user.type(screen.getByLabelText("tokenLabel"), "a-token");
    await user.click(screen.getByRole("button", { name: "previewSubmit" }));
    await user.click(screen.getByRole("button", { name: /acme.*Roadmap/ }));
    await user.click(screen.getByRole("button", { name: "connectSubmit" }));

    expect(connect.mutate).toHaveBeenCalledWith(
      {
        token: "a-token",
        ownerLogin: "acme",
        ownerType: "Organization",
        number: 3,
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("disables the connect button until a board is selected", async () => {
    const preview = baseMutation();
    (preview.mutate as ReturnType<typeof vi.fn>).mockImplementation(
      (_vars: unknown, options: { onSuccess: (boards: unknown) => void }) => {
        options.onSuccess([fakeBoard]);
      },
    );
    mockedUsePreview.mockReturnValue(preview);
    const user = userEvent.setup();

    render(<ConnectBoardDialog projectId="project-1" open={true} onOpenChange={() => {}} />);
    await user.type(screen.getByLabelText("tokenLabel"), "a-token");
    await user.click(screen.getByRole("button", { name: "previewSubmit" }));

    expect(screen.getByRole("button", { name: "connectSubmit" })).toBeDisabled();
  });

  it("shows the API error message inline when preview fails", () => {
    mockedUsePreview.mockReturnValue({
      ...baseMutation(),
      isError: true,
      error: new ApiError("Invalid token", 401),
    } as unknown as ReturnType<typeof usePreviewBoardConnection>);

    render(<ConnectBoardDialog projectId="project-1" open={true} onOpenChange={() => {}} />);

    expect(screen.getByText("Invalid token")).toBeInTheDocument();
  });

  it("shows the API error message inline when connect fails", async () => {
    const preview = baseMutation();
    (preview.mutate as ReturnType<typeof vi.fn>).mockImplementation(
      (_vars: unknown, options: { onSuccess: (boards: unknown) => void }) => {
        options.onSuccess([fakeBoard]);
      },
    );
    mockedUsePreview.mockReturnValue(preview);
    mockedUseConnect.mockReturnValue({
      ...baseMutation(),
      isError: true,
      error: new ApiError("You do not have access to this board", 403),
    } as unknown as ReturnType<typeof useConnectBoard>);
    const user = userEvent.setup();

    render(<ConnectBoardDialog projectId="project-1" open={true} onOpenChange={() => {}} />);
    await user.type(screen.getByLabelText("tokenLabel"), "a-token");
    await user.click(screen.getByRole("button", { name: "previewSubmit" }));

    expect(screen.getByText("You do not have access to this board")).toBeInTheDocument();
  });
});
