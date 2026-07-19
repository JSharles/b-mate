import { render, screen } from "@testing-library/react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMe } from "@/shared/api/auth";
import { ApiError } from "@/shared/lib/api-client";
import ProtectedLayout from "./layout";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/shared/api/auth", () => ({
  getMe: vi.fn(),
}));
vi.mock("./_components/app-sidebar", () => ({
  AppSidebar: ({ user }: { user: { firstName: string } }) => (
    <div data-testid="app-sidebar">{user.firstName}</div>
  ),
}));

const mockedCookies = vi.mocked(cookies);
const mockedRedirect = vi.mocked(redirect);
const mockedGetMe = vi.mocked(getMe);

describe("ProtectedLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCookies.mockResolvedValue({ toString: () => "session_token=abc" } as never);
  });

  it("renders the sidebar and children when authenticated", async () => {
    mockedGetMe.mockResolvedValue({ id: "1", firstName: "Jean" } as never);

    const ui = await ProtectedLayout({ children: <div>page content</div> });
    render(ui);

    expect(screen.getByText("page content")).toBeInTheDocument();
    expect(screen.getByTestId("app-sidebar")).toHaveTextContent("Jean");
  });

  it("redirects to /login on a 401", async () => {
    mockedGetMe.mockRejectedValue(new ApiError("Not authenticated", 401));

    await expect(ProtectedLayout({ children: <div /> })).rejects.toThrow();
    expect(mockedRedirect).toHaveBeenCalledWith("/login");
  });

  it("rethrows non-401 errors instead of redirecting", async () => {
    mockedGetMe.mockRejectedValue(new ApiError("Server error", 500));

    await expect(ProtectedLayout({ children: <div /> })).rejects.toThrow("Server error");
    expect(mockedRedirect).not.toHaveBeenCalled();
  });
});
