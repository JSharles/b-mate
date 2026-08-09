import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useProject } from "../hooks";
import { MeetingLinkCard } from "./meeting-link-card";

vi.mock("../hooks", () => ({
  useProject: vi.fn(),
}));

vi.mock("./edit-meeting-link-dialog", () => ({
  EditMeetingLinkDialog: vi.fn(({ open }: { open: boolean }) => (
    <div data-testid="edit-meeting-link-dialog">{open ? "open" : "closed"}</div>
  )),
}));

const mockedUseProject = vi.mocked(useProject);

describe("MeetingLinkCard", () => {
  it("shows a skeleton while pending", () => {
    mockedUseProject.mockReturnValue({
      data: undefined,
      isPending: true,
    } as unknown as ReturnType<typeof useProject>);

    const { container } = render(<MeetingLinkCard projectId="project-1" />);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("shows the not-set state when no link is saved", () => {
    mockedUseProject.mockReturnValue({
      data: { meetingUrl: null },
      isPending: false,
    } as unknown as ReturnType<typeof useProject>);

    render(<MeetingLinkCard projectId="project-1" />);

    expect(screen.getByText("notSet")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows a link to the saved meeting URL", () => {
    mockedUseProject.mockReturnValue({
      data: { meetingUrl: "https://meet.google.com/abc-defg-hij" },
      isPending: false,
    } as unknown as ReturnType<typeof useProject>);

    render(<MeetingLinkCard projectId="project-1" />);

    expect(screen.getByRole("link", { name: /viewLink/ })).toHaveAttribute(
      "href",
      "https://meet.google.com/abc-defg-hij",
    );
  });

  it("opens the edit dialog when Edit is clicked", async () => {
    mockedUseProject.mockReturnValue({
      data: { meetingUrl: null },
      isPending: false,
    } as unknown as ReturnType<typeof useProject>);
    const user = userEvent.setup();

    render(<MeetingLinkCard projectId="project-1" />);
    expect(screen.getByTestId("edit-meeting-link-dialog")).toHaveTextContent("closed");

    await user.click(screen.getByRole("button", { name: "edit" }));

    expect(screen.getByTestId("edit-meeting-link-dialog")).toHaveTextContent("open");
  });
});
