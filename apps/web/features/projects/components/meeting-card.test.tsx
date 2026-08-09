import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useProject } from "../hooks";
import { MeetingCard } from "./meeting-card";

vi.mock("../hooks", () => ({
  useProject: vi.fn(),
}));

const mockedUseProject = vi.mocked(useProject);

describe("MeetingCard", () => {
  it("shows a skeleton while pending", () => {
    mockedUseProject.mockReturnValue({
      data: undefined,
      isPending: true,
    } as unknown as ReturnType<typeof useProject>);

    const { container } = render(<MeetingCard projectId="project-1" />);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("falls back to the coming-soon placeholder when no meeting link is set", () => {
    mockedUseProject.mockReturnValue({
      data: { meetingUrl: null },
      isPending: false,
    } as unknown as ReturnType<typeof useProject>);

    render(<MeetingCard projectId="project-1" />);

    expect(screen.getByText("hint")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows a Join meeting button linking to the saved URL when one is set", () => {
    mockedUseProject.mockReturnValue({
      data: { meetingUrl: "https://meet.google.com/abc-defg-hij" },
      isPending: false,
    } as unknown as ReturnType<typeof useProject>);

    render(<MeetingCard projectId="project-1" />);

    expect(screen.getByRole("link", { name: /join/ })).toHaveAttribute(
      "href",
      "https://meet.google.com/abc-defg-hij",
    );
  });
});
