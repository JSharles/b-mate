import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

describe("proxy", () => {
  it("redirects a bare protected path straight to the default locale's login", () => {
    const request = new NextRequest("http://localhost:3000/home");

    const response = proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/fr/login");
  });

  it("redirects to /fr/login when there is no session cookie", () => {
    const request = new NextRequest("http://localhost:3000/fr/home");

    const response = proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/fr/login");
  });

  it("preserves the current locale (en) on the auth redirect", () => {
    const request = new NextRequest("http://localhost:3000/en/home");

    const response = proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/en/login");
  });

  it("lets a protected request through when a session cookie is present", () => {
    const request = new NextRequest("http://localhost:3000/fr/home", {
      headers: { cookie: "session_token=abc123" },
    });

    const response = proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not gate a public page (no session needed)", () => {
    const request = new NextRequest("http://localhost:3000/fr/login");

    const response = proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects a bare path to the default locale", () => {
    const request = new NextRequest("http://localhost:3000/");

    const response = proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/fr");
  });
});
