import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/shared/lib/api-client";
import { login, logout, signup } from "./api";

vi.mock("@/shared/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

describe("features/auth/api", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it("signup posts to /auth/signup", async () => {
    mockedApiFetch.mockResolvedValue({ id: "1" });
    const data = { firstName: "Jean", lastName: "Charles", email: "jc@example.com", password: "supersecret123" };

    await signup(data);

    expect(mockedApiFetch).toHaveBeenCalledWith("/auth/signup", { method: "POST", body: data });
  });

  it("login posts to /auth/login", async () => {
    mockedApiFetch.mockResolvedValue({ id: "1" });
    const data = { email: "jc@example.com", password: "supersecret123" };

    await login(data);

    expect(mockedApiFetch).toHaveBeenCalledWith("/auth/login", { method: "POST", body: data });
  });

  it("logout posts to /auth/logout", async () => {
    mockedApiFetch.mockResolvedValue({ success: true });

    await logout();

    expect(mockedApiFetch).toHaveBeenCalledWith("/auth/logout", { method: "POST" });
  });
});
