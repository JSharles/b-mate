import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCurrentUser } from "@/shared/hooks/use-current-user";
import HomePage from "./page";

vi.mock("@/features/projects/components/project-list", () => ({
  ProjectList: () => <div>project-list</div>,
}));

vi.mock("@/shared/hooks/use-current-user", () => ({
  useCurrentUser: vi.fn(),
}));

const mockedUseCurrentUser = vi.mocked(useCurrentUser);

describe("HomePage", () => {
  beforeEach(() => {
    mockedUseCurrentUser.mockReset();
  });

  it("renders the project list", () => {
    mockedUseCurrentUser.mockReturnValue({
      isPending: false,
      data: { firstName: "Jean", lastName: "Charles", email: "jc@example.com" },
    } as unknown as ReturnType<typeof useCurrentUser>);

    render(<HomePage />);

    expect(screen.getByText("project-list")).toBeInTheDocument();
  });

  it("shows a welcome heading with the signed-in user's first name", () => {
    mockedUseCurrentUser.mockReturnValue({
      isPending: false,
      data: { firstName: "Jean", lastName: "Charles", email: "jc@example.com" },
    } as unknown as ReturnType<typeof useCurrentUser>);

    render(<HomePage />);

    expect(screen.getByRole("heading", { name: "welcome" })).toBeInTheDocument();
  });

  it("shows a skeleton instead of the heading while pending", () => {
    mockedUseCurrentUser.mockReturnValue({
      isPending: true,
      data: undefined,
    } as unknown as ReturnType<typeof useCurrentUser>);

    const { container } = render(<HomePage />);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
