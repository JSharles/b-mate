import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSearchParams } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api-client";
import { useConnectBoard, usePreviewBoardConnection } from "../hooks";
import { ConnectBoardDialog } from "./connect-board-dialog";

vi.mock("../hooks", () => ({
  usePreviewBoardConnection: vi.fn(),
  useConnectBoard: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(),
}));

const mockedUsePreview = vi.mocked(usePreviewBoardConnection);
const mockedUseConnect = vi.mocked(useConnectBoard);
const mockedUseSearchParams = vi.mocked(useSearchParams);

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

function paramsWith(entries: Record<string, string> = {}) {
  return {
    get: (key: string) => entries[key] ?? null,
  } as unknown as ReturnType<typeof useSearchParams>;
}

describe("ConnectBoardDialog", () => {
  beforeEach(() => {
    mockedUsePreview.mockReturnValue(baseMutation());
    mockedUseConnect.mockReturnValue(
      baseMutation() as unknown as ReturnType<typeof useConnectBoard>,
    );
    mockedUseSearchParams.mockReturnValue(paramsWith());
  });

  it("renders a single Continue-with-GitHub link, no token input anywhere", () => {
    render(<ConnectBoardDialog projectId="project-1" open={true} onOpenChange={() => {}} />);

    expect(screen.getByRole("link", { name: "continueWithGithub" })).toHaveAttribute(
      "href",
      "http://localhost:3001/projects/project-1/board-connection/github/authorize?locale=fr",
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does not call preview automatically when there is no connectBoard flag in the URL", () => {
    const preview = baseMutation();
    mockedUsePreview.mockReturnValue(preview);

    render(<ConnectBoardDialog projectId="project-1" open={true} onOpenChange={() => {}} />);

    expect(preview.mutate).not.toHaveBeenCalled();
  });

  it("calls preview with no token and shows the board picker directly when connectBoard=1 is in the URL", async () => {
    mockedUseSearchParams.mockReturnValue(paramsWith({ connectBoard: "1" }));
    const preview = baseMutation();
    (preview.mutate as ReturnType<typeof vi.fn>).mockImplementation(
      (_vars: unknown, options: { onSuccess: (boards: unknown) => void }) => {
        options.onSuccess([fakeBoard]);
      },
    );
    mockedUsePreview.mockReturnValue(preview);

    render(<ConnectBoardDialog projectId="project-1" open={true} onOpenChange={() => {}} />);

    expect(preview.mutate).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(
      await screen.findByRole("radio", { name: /acme.*Roadmap/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "continueWithGithub" })).not.toBeInTheDocument();
  });

  it("shows a message when the authorized account has no accessible boards", async () => {
    mockedUseSearchParams.mockReturnValue(paramsWith({ connectBoard: "1" }));
    const preview = baseMutation();
    (preview.mutate as ReturnType<typeof vi.fn>).mockImplementation(
      (_vars: unknown, options: { onSuccess: (boards: unknown) => void }) => {
        options.onSuccess([]);
      },
    );
    mockedUsePreview.mockReturnValue(preview);

    render(<ConnectBoardDialog projectId="project-1" open={true} onOpenChange={() => {}} />);

    expect(await screen.findByText("noBoards")).toBeInTheDocument();
  });

  it("connects the selected board without a token in the payload", async () => {
    mockedUseSearchParams.mockReturnValue(paramsWith({ connectBoard: "1" }));
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
    await user.click(await screen.findByRole("radio", { name: /acme.*Roadmap/ }));
    await user.click(screen.getByRole("button", { name: "connectSubmit" }));

    expect(connect.mutate).toHaveBeenCalledWith(
      {
        ownerLogin: "acme",
        ownerType: "Organization",
        number: 3,
        estimateUnit: "days",
      },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("passes the selected estimate unit through to connect", async () => {
    mockedUseSearchParams.mockReturnValue(paramsWith({ connectBoard: "1" }));
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
    await user.click(await screen.findByRole("radio", { name: /acme.*Roadmap/ }));
    await user.click(screen.getByRole("radio", { name: "estimateUnitHours" }));
    await user.click(screen.getByRole("button", { name: "connectSubmit" }));

    expect(connect.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ estimateUnit: "hours" }),
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("disables the connect button until a board is selected", async () => {
    mockedUseSearchParams.mockReturnValue(paramsWith({ connectBoard: "1" }));
    const preview = baseMutation();
    (preview.mutate as ReturnType<typeof vi.fn>).mockImplementation(
      (_vars: unknown, options: { onSuccess: (boards: unknown) => void }) => {
        options.onSuccess([fakeBoard]);
      },
    );
    mockedUsePreview.mockReturnValue(preview);

    render(<ConnectBoardDialog projectId="project-1" open={true} onOpenChange={() => {}} />);
    await screen.findByRole("radio", { name: /acme.*Roadmap/ });

    expect(screen.getByRole("button", { name: "connectSubmit" })).toBeDisabled();
  });

  it("shows the API error message inline when the automatic preview fails", () => {
    mockedUseSearchParams.mockReturnValue(paramsWith({ connectBoard: "1" }));
    mockedUsePreview.mockReturnValue({
      ...baseMutation(),
      isError: true,
      error: new ApiError("No GitHub authorization found.", 400),
    } as unknown as ReturnType<typeof usePreviewBoardConnection>);

    render(<ConnectBoardDialog projectId="project-1" open={true} onOpenChange={() => {}} />);

    expect(screen.getByText("No GitHub authorization found.")).toBeInTheDocument();
  });

  it("shows the API error message inline when connect fails", async () => {
    mockedUseSearchParams.mockReturnValue(paramsWith({ connectBoard: "1" }));
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

    render(<ConnectBoardDialog projectId="project-1" open={true} onOpenChange={() => {}} />);
    await screen.findByRole("radio", { name: /acme.*Roadmap/ });

    expect(screen.getByText("You do not have access to this board")).toBeInTheDocument();
  });
});
