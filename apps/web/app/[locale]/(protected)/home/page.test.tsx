import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCurrentUser } from "@/shared/hooks/use-current-user";
import HomePage from "./page";

vi.mock("@/features/projects/components/project-list", () => ({
  ProjectList: () => <div>project-list</div>,
}));

vi.mock("@/features/home/components/welcome-card", () => ({
  WelcomeCard: ({ isPending }: { isPending: boolean }) => (
    <div>welcome-card:{isPending ? "pending" : "ready"}</div>
  ),
}));

vi.mock("@/shared/hooks/use-current-user", () => ({
  useCurrentUser: vi.fn(),
}));

const mockedUseCurrentUser = vi.mocked(useCurrentUser);

describe("HomePage", () => {
  beforeEach(() => {
    mockedUseCurrentUser.mockReset();
  });

  it("renders the welcome card and the project list", () => {
    mockedUseCurrentUser.mockReturnValue({
      isPending: false,
      data: { firstName: "Jean", lastName: "Charles", email: "jc@example.com" },
    } as unknown as ReturnType<typeof useCurrentUser>);

    render(<HomePage />);

    expect(screen.getByText("welcome-card:ready")).toBeInTheDocument();
    expect(screen.getByText("project-list")).toBeInTheDocument();
  });

  it("passes the pending state through to the welcome card", () => {
    mockedUseCurrentUser.mockReturnValue({
      isPending: true,
      data: undefined,
    } as unknown as ReturnType<typeof useCurrentUser>);

    render(<HomePage />);

    expect(screen.getByText("welcome-card:pending")).toBeInTheDocument();
  });
});
