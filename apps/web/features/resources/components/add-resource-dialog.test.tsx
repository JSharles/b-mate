import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNotionConnectionStatus } from "@/shared/hooks/use-notion-connection-status";
import { ApiError } from "@/shared/lib/api-client";
import { useConnectNotionResource, useUploadResource } from "../hooks";
import { AddResourceDialog } from "./add-resource-dialog";

vi.mock("../hooks", () => ({
  useUploadResource: vi.fn(),
  useConnectNotionResource: vi.fn(),
}));

vi.mock("@/shared/hooks/use-notion-connection-status", () => ({
  useNotionConnectionStatus: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mockedUseUploadResource = vi.mocked(useUploadResource);
const mockedUseConnectNotionResource = vi.mocked(useConnectNotionResource);
const mockedUseNotionConnectionStatus = vi.mocked(useNotionConnectionStatus);

function baseMutation<T extends (...args: never[]) => { mutate: unknown }>() {
  return {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<T>;
}

function notionStatus(connected: boolean) {
  return {
    data: { connected },
    isPending: false,
  } as unknown as ReturnType<typeof useNotionConnectionStatus>;
}

const fakeFile = new File(["%PDF-1.4 fake"], "Architecture overview.pdf", {
  type: "application/pdf",
});

describe("AddResourceDialog", () => {
  beforeEach(() => {
    mockedUseUploadResource.mockReturnValue(baseMutation<typeof useUploadResource>());
    mockedUseConnectNotionResource.mockReturnValue(
      baseMutation<typeof useConnectNotionResource>(),
    );
    mockedUseNotionConnectionStatus.mockReturnValue(notionStatus(false));
  });

  it("renders a file input and an upload submit button", () => {
    render(<AddResourceDialog projectId="project-1" open={true} onOpenChange={() => {}} />);

    expect(screen.getByLabelText("fileLabel")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "uploadSubmit" })).toBeInTheDocument();
  });

  it("disables submit until a file is selected", () => {
    render(<AddResourceDialog projectId="project-1" open={true} onOpenChange={() => {}} />);

    expect(screen.getByRole("button", { name: "uploadSubmit" })).toBeDisabled();
  });

  it("submits the selected file to the upload mutation", async () => {
    const upload = baseMutation<typeof useUploadResource>();
    mockedUseUploadResource.mockReturnValue(upload);
    const user = userEvent.setup();

    render(<AddResourceDialog projectId="project-1" open={true} onOpenChange={() => {}} />);
    const input = screen.getByLabelText("fileLabel");
    await user.upload(input, fakeFile);
    await user.click(screen.getByRole("button", { name: "uploadSubmit" }));

    expect(upload.mutate).toHaveBeenCalledWith(
      fakeFile,
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("closes the dialog once the upload succeeds", async () => {
    const upload = baseMutation<typeof useUploadResource>();
    (upload.mutate as ReturnType<typeof vi.fn>).mockImplementation(
      (_file: File, options: { onSuccess: () => void }) => options.onSuccess(),
    );
    mockedUseUploadResource.mockReturnValue(upload);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(<AddResourceDialog projectId="project-1" open={true} onOpenChange={onOpenChange} />);
    await user.upload(screen.getByLabelText("fileLabel"), fakeFile);
    await user.click(screen.getByRole("button", { name: "uploadSubmit" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows the API error message inline when the upload fails", () => {
    mockedUseUploadResource.mockReturnValue({
      ...baseMutation<typeof useUploadResource>(),
      isError: true,
      error: new ApiError("Unsupported file type.", 400),
    } as unknown as ReturnType<typeof useUploadResource>);

    render(<AddResourceDialog projectId="project-1" open={true} onOpenChange={() => {}} />);

    expect(screen.getByText("Unsupported file type.")).toBeInTheDocument();
  });

  describe("Notion tab, no connection configured", () => {
    it("shows only the explanatory message and a link to Settings — no fields, no submit", async () => {
      const user = userEvent.setup();
      render(<AddResourceDialog projectId="project-1" open={true} onOpenChange={() => {}} />);
      await user.click(screen.getByRole("tab", { name: "notionTab" }));

      expect(screen.getByText("notionNotConnectedMessage")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "notionGoToSettings" })).toHaveAttribute(
        "href",
        "/projects/project-1",
      );
      expect(screen.queryByLabelText("notionPageUrlLabel")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "notionConnectSubmit" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Notion tab, connection already configured", () => {
    beforeEach(() => {
      mockedUseNotionConnectionStatus.mockReturnValue(notionStatus(true));
    });

    async function switchToNotionTab() {
      const user = userEvent.setup();
      render(<AddResourceDialog projectId="project-1" open={true} onOpenChange={() => {}} />);
      await user.click(screen.getByRole("tab", { name: "notionTab" }));
      return user;
    }

    it("shows a page-URL field and a disabled submit until it's filled — no token field, no Settings link", async () => {
      await switchToNotionTab();

      expect(screen.getByLabelText("notionPageUrlLabel")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "notionConnectSubmit" })).toBeDisabled();
      expect(screen.queryByRole("link", { name: "notionGoToSettings" })).not.toBeInTheDocument();
    });

    it("submits only the page URL to the Notion-connect mutation", async () => {
      const connectNotion = baseMutation<typeof useConnectNotionResource>();
      mockedUseConnectNotionResource.mockReturnValue(connectNotion);
      const user = await switchToNotionTab();

      await user.type(
        screen.getByLabelText("notionPageUrlLabel"),
        "https://notion.so/some-page",
      );
      await user.click(screen.getByRole("button", { name: "notionConnectSubmit" }));

      expect(connectNotion.mutate).toHaveBeenCalledWith(
        { pageUrl: "https://notion.so/some-page" },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      );
    });

    it("shows an inline error and keeps the dialog open when the resource creation fails", async () => {
      mockedUseConnectNotionResource.mockReturnValue({
        ...baseMutation<typeof useConnectNotionResource>(),
        isError: true,
        error: new ApiError("Unable to access this Notion page.", 400),
      } as unknown as ReturnType<typeof useConnectNotionResource>);
      const onOpenChange = vi.fn();

      render(
        <AddResourceDialog projectId="project-1" open={true} onOpenChange={onOpenChange} />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole("tab", { name: "notionTab" }));

      expect(screen.getByText("Unable to access this Notion page.")).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });
});
