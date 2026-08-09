import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api-client";
import { useConnectNotionConnection } from "../hooks";
import { ConnectNotionDialog } from "./connect-notion-dialog";

vi.mock("../hooks", () => ({
  useConnectNotionConnection: vi.fn(),
}));

const mockedUseConnect = vi.mocked(useConnectNotionConnection);

function baseMutation() {
  return {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useConnectNotionConnection>;
}

describe("ConnectNotionDialog", () => {
  beforeEach(() => {
    mockedUseConnect.mockReturnValue(baseMutation());
  });

  it("renders a token field and a disabled submit until it's filled", () => {
    render(<ConnectNotionDialog projectId="project-1" open={true} onOpenChange={() => {}} />);

    expect(screen.getByLabelText("tokenLabel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "connectSubmit" })).toBeDisabled();
  });

  it("links to where a developer can create a Notion integration token", () => {
    render(<ConnectNotionDialog projectId="project-1" open={true} onOpenChange={() => {}} />);

    expect(screen.getByText("tokenHint")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /notion\.so\/my-integrations/ })).toHaveAttribute(
      "href",
      "https://www.notion.so/my-integrations",
    );
  });

  it("does not autocomplete the token field", () => {
    render(<ConnectNotionDialog projectId="project-1" open={true} onOpenChange={() => {}} />);

    expect(screen.getByLabelText("tokenLabel")).toHaveAttribute("autoComplete", "off");
  });

  it("submits the token to the connect mutation", async () => {
    const connect = baseMutation();
    mockedUseConnect.mockReturnValue(connect);
    const user = userEvent.setup();

    render(<ConnectNotionDialog projectId="project-1" open={true} onOpenChange={() => {}} />);
    await user.type(screen.getByLabelText("tokenLabel"), "secret-token");
    await user.click(screen.getByRole("button", { name: "connectSubmit" }));

    expect(connect.mutate).toHaveBeenCalledWith(
      { token: "secret-token" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("closes the dialog once the connection succeeds", async () => {
    const connect = baseMutation();
    (connect.mutate as ReturnType<typeof vi.fn>).mockImplementation(
      (_data: unknown, options: { onSuccess: () => void }) => options.onSuccess(),
    );
    mockedUseConnect.mockReturnValue(connect);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ConnectNotionDialog projectId="project-1" open={true} onOpenChange={onOpenChange} />,
    );
    await user.type(screen.getByLabelText("tokenLabel"), "secret-token");
    await user.click(screen.getByRole("button", { name: "connectSubmit" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows an inline error and keeps the dialog open when the connection fails", async () => {
    mockedUseConnect.mockReturnValue({
      ...baseMutation(),
      isError: true,
      error: new ApiError("Unable to access this Notion page.", 400),
    } as unknown as ReturnType<typeof useConnectNotionConnection>);
    const onOpenChange = vi.fn();

    render(
      <ConnectNotionDialog projectId="project-1" open={true} onOpenChange={onOpenChange} />,
    );

    expect(screen.getByText("Unable to access this Notion page.")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
