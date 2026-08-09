import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCurrentUser } from "@/shared/hooks/use-current-user";
import ProfilePage from "./page";

vi.mock("@/shared/hooks/use-current-user", () => ({
  useCurrentUser: vi.fn(),
}));

const mockedBack = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ back: mockedBack }),
}));

vi.mock("@/features/auth/components/profile-form", () => ({
  ProfileForm: () => <div>profile-form</div>,
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

  it("renders the user's name and email once loaded, plus the edit form", () => {
    mockedUseCurrentUser.mockReturnValue({
      isPending: false,
      data: { firstName: "Jean", lastName: "Charles", email: "jc@example.com" },
    } as unknown as ReturnType<typeof useCurrentUser>);

    render(<ProfilePage />);

    expect(screen.getByText("Jean Charles")).toBeInTheDocument();
    expect(screen.getByText("jc@example.com")).toBeInTheDocument();
    expect(screen.getByText("profile-form")).toBeInTheDocument();
  });

  it("navigates back to wherever the user came from when Back is clicked", async () => {
    mockedUseCurrentUser.mockReturnValue({
      isPending: false,
      data: { firstName: "Jean", lastName: "Charles", email: "jc@example.com" },
    } as unknown as ReturnType<typeof useCurrentUser>);
    const user = userEvent.setup();

    render(<ProfilePage />);
    await user.click(screen.getByRole("button", { name: "back" }));

    expect(mockedBack).toHaveBeenCalled();
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
