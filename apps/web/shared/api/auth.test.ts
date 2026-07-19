import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../lib/api-client";
import { getMe } from "./auth";

vi.mock("../lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

const mockedApiFetch = vi.mocked(apiFetch);

describe("getMe", () => {
  beforeEach(() => {
    mockedApiFetch.mockReset();
  });

  it("calls /auth/me with no extra headers by default", async () => {
    mockedApiFetch.mockResolvedValue({ id: "1" });

    await getMe();

    expect(mockedApiFetch).toHaveBeenCalledWith("/auth/me", { headers: undefined });
  });

  it("forwards the Cookie header when called from a Server Component", async () => {
    mockedApiFetch.mockResolvedValue({ id: "1" });

    await getMe({ cookie: "session_token=abc" });

    expect(mockedApiFetch).toHaveBeenCalledWith("/auth/me", {
      headers: { Cookie: "session_token=abc" },
    });
  });
});
