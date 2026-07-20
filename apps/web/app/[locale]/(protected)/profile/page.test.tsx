import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCurrentUser } from "@/shared/hooks/use-current-user";
import ProfilePage from "./page";

vi.mock("@/shared/hooks/use-current-user", () => ({
  useCurrentUser: vi.fn(),
}));

const mockedUseCurrentUser = vi.mocked(useCurrentUser);

describe("ProfilePage", () => {
  beforeEach(() => {
    mockedUseCurrentUser.mockReset();
  });

  it("shows a skeleton while pending", () => {
    mockedUseCurrentUser.mockReturnValue({
      isPending: true,
      data: undefined,
    } as unknown as ReturnType<typeof useCurrentUser>);

    const { container } = render(<ProfilePage />);

    expect(container.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("renders the user's name and email once loaded", () => {
    mockedUseCurrentUser.mockReturnValue({
      isPending: false,
      data: { firstName: "Jean", lastName: "Charles", email: "jc@example.com" },
    } as unknown as ReturnType<typeof useCurrentUser>);

    render(<ProfilePage />);

    expect(screen.getByText("Jean Charles")).toBeInTheDocument();
    expect(screen.getByText("jc@example.com")).toBeInTheDocument();
  });

  it("renders nothing when there is no user", () => {
    mockedUseCurrentUser.mockReturnValue({
      isPending: false,
      data: null,
    } as unknown as ReturnType<typeof useCurrentUser>);

    const { container } = render(<ProfilePage />);

    expect(container).toBeEmptyDOMElement();
  });
});
