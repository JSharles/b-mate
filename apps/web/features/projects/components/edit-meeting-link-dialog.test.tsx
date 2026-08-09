import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/lib/api-client";
import { useUpdateProject } from "../hooks";
import { EditMeetingLinkDialog } from "./edit-meeting-link-dialog";

vi.mock("../hooks", () => ({
  useUpdateProject: vi.fn(),
}));

const mockedUseUpdateProject = vi.mocked(useUpdateProject);

function stubUpdate(overrides: Record<string, unknown> = {}) {
  const mutate = vi.fn();
  const reset = vi.fn();
  mockedUseUpdateProject.mockReturnValue({
    mutate,
    reset,
    isPending: false,
    isError: false,
    error: null,
    ...overrides,
  } as unknown as ReturnType<typeof useUpdateProject>);
  return mutate;
}

describe("EditMeetingLinkDialog", () => {
  it("pre-fills the field with the currently saved link", () => {
    stubUpdate();

    render(
      <EditMeetingLinkDialog
        projectId="project-1"
        currentUrl="https://meet.google.com/abc-defg-hij"
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("urlLabel")).toHaveValue(
      "https://meet.google.com/abc-defg-hij",
    );
  });

  it("saves the trimmed URL on submit", async () => {
    const mutate = stubUpdate();
    const user = userEvent.setup();

    render(
      <EditMeetingLinkDialog
        projectId="project-1"
        currentUrl={null}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText("urlLabel"), "  https://meet.google.com/xyz  ");
    await user.click(screen.getByRole("button", { name: "save" }));

    expect(mutate).toHaveBeenCalledWith(
      { meetingUrl: "https://meet.google.com/xyz" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("clears the link when submitted empty", async () => {
    const mutate = stubUpdate();
    const user = userEvent.setup();

    render(
      <EditMeetingLinkDialog
        projectId="project-1"
        currentUrl="https://meet.google.com/abc-defg-hij"
        open={true}
        onOpenChange={vi.fn()}
      />,
    );
    await user.clear(screen.getByLabelText("urlLabel"));
    await user.click(screen.getByRole("button", { name: "save" }));

    expect(mutate).toHaveBeenCalledWith(
      { meetingUrl: null },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("shows an inline error when the update fails", () => {
    stubUpdate({ isError: true, error: new ApiError("Something went wrong", 500) });

    render(
      <EditMeetingLinkDialog
        projectId="project-1"
        currentUrl={null}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("re-seeds the field from the latest saved value each time it opens", () => {
    stubUpdate();
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <EditMeetingLinkDialog
        projectId="project-1"
        currentUrl="https://meet.google.com/first"
        open={false}
        onOpenChange={onOpenChange}
      />,
    );

    rerender(
      <EditMeetingLinkDialog
        projectId="project-1"
        currentUrl="https://meet.google.com/second"
        open={true}
        onOpenChange={onOpenChange}
      />,
    );

    expect(screen.getByLabelText("urlLabel")).toHaveValue("https://meet.google.com/second");
  });
});
