import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError } from "./api-client";

function mockFetchOnce(
  response: Partial<Response> & { json?: () => Promise<unknown>; text?: () => Promise<string> },
) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({}),
    text: async () => "{}",
    ...response,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("apiFetch", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends credentials and returns the parsed JSON body on success", async () => {
    const fetchMock = mockFetchOnce({ text: async () => JSON.stringify({ id: "1" }) });

    const result = await apiFetch<{ id: string }>("/auth/me");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/auth/me",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(result).toEqual({ id: "1" });
  });

  it("serializes the body and sets Content-Type when a body is provided", async () => {
    const fetchMock = mockFetchOnce({ text: async () => JSON.stringify({ ok: true }) });

    await apiFetch("/auth/login", { method: "POST", body: { email: "a@b.com" } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(JSON.stringify({ email: "a@b.com" }));
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("returns undefined for a 204 response without parsing a body", async () => {
    mockFetchOnce({
      status: 204,
      text: async () => {
        throw new Error("should not be called");
      },
    });

    const result = await apiFetch("/auth/logout", { method: "POST" });

    expect(result).toBeUndefined();
  });

  it("returns undefined for a 200 response with an empty body (Nest's null/undefined return)", async () => {
    mockFetchOnce({ status: 200, text: async () => "" });

    const result = await apiFetch("/projects/1/board-connection");

    expect(result).toBeUndefined();
  });

  it("throws an ApiError with the backend message on failure", async () => {
    mockFetchOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ message: "Invalid credentials" }),
    });

    await expect(apiFetch("/auth/login")).rejects.toMatchObject({
      message: "Invalid credentials",
      status: 401,
    });
  });

  it("joins array validation messages from class-validator", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ message: ["email must be an email", "password too short"] }),
    });

    await expect(apiFetch("/auth/signup")).rejects.toThrow(
      "email must be an email, password too short",
    );
  });

  it("falls back to statusText when the error body has no message", async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => {
        throw new Error("not json");
      },
    });

    const error = await apiFetch("/auth/me").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe("Internal Server Error");
  });
});
