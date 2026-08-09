import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api-client";
import { useUpdateProfile } from "../hooks";
import { EditableField } from "./editable-field";

vi.mock("../hooks", () => ({
  useUpdateProfile: vi.fn(),
}));

const mockedUseUpdateProfile = vi.mocked(useUpdateProfile);

function baseMutation() {
  return {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  } as unknown as ReturnType<typeof useUpdateProfile>;
}

describe("EditableField", () => {
  beforeEach(() => {
    mockedUseUpdateProfile.mockReturnValue(baseMutation());
  });

  it("shows the current value as plain, non-editable text by default", () => {
    render(<EditableField fieldKey="roleTitle" label="Role title" value="Lead developer" />);

    expect(screen.getByText("Lead developer")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows the placeholder when there is no value yet", () => {
    render(
      <EditableField
        fieldKey="website"
        label="Website"
        value={null}
        placeholder="yoursite.com"
      />,
    );

    expect(screen.getByText("yoursite.com")).toBeInTheDocument();
  });

  it("enters edit mode, pre-filled with the current value, when clicked", async () => {
    const user = userEvent.setup();
    render(<EditableField fieldKey="roleTitle" label="Role title" value="Lead developer" />);

    await user.click(screen.getByText("Lead developer"));

    expect(screen.getByRole("textbox")).toHaveValue("Lead developer");
  });

  it("saves the field with just that field's key when Save is clicked", async () => {
    const mutation = baseMutation();
    mockedUseUpdateProfile.mockReturnValue(mutation);
    const user = userEvent.setup();

    render(<EditableField fieldKey="linkedin" label="LinkedIn" value={null} placeholder="linkedin.com/in/you" />);
    await user.click(screen.getByRole("button", { name: /linkedin\.com\/in\/you/ }));
    await user.type(screen.getByRole("textbox"), "linkedin.com/in/jc");
    await user.click(screen.getByRole("button", { name: "save" }));

    expect(mutation.mutate).toHaveBeenCalledWith(
      { linkedin: "linkedin.com/in/jc" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("saves on Enter", async () => {
    const mutation = baseMutation();
    mockedUseUpdateProfile.mockReturnValue(mutation);
    const user = userEvent.setup();

    render(<EditableField fieldKey="phone" label="Phone" value={null} placeholder="06 00 00 00 00" />);
    await user.click(screen.getByRole("button", { name: /06 00 00 00 00/ }));
    await user.type(screen.getByRole("textbox"), "0600000000{Enter}");

    expect(mutation.mutate).toHaveBeenCalledWith(
      { phone: "0600000000" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("sends null when the field is cleared out entirely", async () => {
    const mutation = baseMutation();
    mockedUseUpdateProfile.mockReturnValue(mutation);
    const user = userEvent.setup();

    render(<EditableField fieldKey="phone" label="Phone" value="0600000000" />);
    await user.click(screen.getByText("0600000000"));
    await user.clear(screen.getByRole("textbox"));
    await user.click(screen.getByRole("button", { name: "save" }));

    expect(mutation.mutate).toHaveBeenCalledWith(
      { phone: null },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("does not call the mutation when saving an unchanged value — just closes", async () => {
    const mutation = baseMutation();
    mockedUseUpdateProfile.mockReturnValue(mutation);
    const user = userEvent.setup();

    render(<EditableField fieldKey="roleTitle" label="Role title" value="Lead developer" />);
    await user.click(screen.getByText("Lead developer"));
    await user.click(screen.getByRole("button", { name: "save" }));

    expect(mutation.mutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("discards the draft and exits edit mode on Cancel, without saving", async () => {
    const mutation = baseMutation();
    mockedUseUpdateProfile.mockReturnValue(mutation);
    const user = userEvent.setup();

    render(<EditableField fieldKey="roleTitle" label="Role title" value="Lead developer" />);
    await user.click(screen.getByText("Lead developer"));
    await user.clear(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "Something else");
    await user.click(screen.getByRole("button", { name: "cancel" }));

    expect(mutation.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("Lead developer")).toBeInTheDocument();
  });

  it("discards the draft and exits edit mode on Escape", async () => {
    const user = userEvent.setup();
    render(<EditableField fieldKey="roleTitle" label="Role title" value="Lead developer" />);

    await user.click(screen.getByText("Lead developer"));
    await user.type(screen.getByRole("textbox"), "{Escape}");

    expect(screen.getByText("Lead developer")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows the mutation's error message inline while staying in edit mode", async () => {
    mockedUseUpdateProfile.mockReturnValue({
      ...baseMutation(),
      isError: true,
      error: new ApiError("Something went wrong", 500),
    } as unknown as ReturnType<typeof useUpdateProfile>);
    const user = userEvent.setup();

    render(<EditableField fieldKey="roleTitle" label="Role title" value="Lead developer" />);
    await user.click(screen.getByText("Lead developer"));

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});
