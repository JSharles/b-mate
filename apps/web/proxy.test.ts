import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

describe("proxy", () => {
  it("redirects to /login when there is no session cookie", () => {
    const request = new NextRequest("http://localhost:3000/home");

    const response = proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("lets the request through when a session cookie is present", () => {
    const request = new NextRequest("http://localhost:3000/home", {
      headers: { cookie: "session_token=abc123" },
    });

    const response = proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
