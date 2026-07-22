import { render, screen } from "@testing-library/react";
import { cookies } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "@/i18n/navigation";
import { getMe } from "@/shared/api/auth";
import { ApiError } from "@/shared/lib/api-client";
import ProtectedLayout from "./layout";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/shared/api/auth", () => ({
  getMe: vi.fn(),
}));
vi.mock("@/shared/components/top-nav", () => ({
  TopNav: ({ user }: { user: { firstName: string } }) => (
    <div data-testid="top-nav">{user.firstName}</div>
  ),
}));

const mockedCookies = vi.mocked(cookies);
const mockedRedirect = vi.mocked(redirect);
const mockedGetMe = vi.mocked(getMe);

const params = Promise.resolve({ locale: "fr" });

describe("ProtectedLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCookies.mockResolvedValue({ toString: () => "session_token=abc" } as never);
  });

  it("renders the top nav and children when authenticated", async () => {
    mockedGetMe.mockResolvedValue({ id: "1", firstName: "Jean" } as never);

    const ui = await ProtectedLayout({ children: <div>page content</div>, params });
    render(ui);

    expect(screen.getByText("page content")).toBeInTheDocument();
    expect(screen.getByTestId("top-nav")).toHaveTextContent("Jean");
  });

  it("redirects to /login on a 401, preserving the current locale", async () => {
    mockedGetMe.mockRejectedValue(new ApiError("Not authenticated", 401));

    await expect(ProtectedLayout({ children: <div />, params })).rejects.toThrow();
    expect(mockedRedirect).toHaveBeenCalledWith({ href: "/login", locale: "fr" });
  });

  it("rethrows non-401 errors instead of redirecting", async () => {
    mockedGetMe.mockRejectedValue(new ApiError("Server error", 500));

    await expect(ProtectedLayout({ children: <div />, params })).rejects.toThrow(
      "Server error",
    );
    expect(mockedRedirect).not.toHaveBeenCalled();
  });
});
