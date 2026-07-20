import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots", () => {
  it("allows crawling but excludes private per-user pages, and points at the sitemap", () => {
    const result = robots();

    expect(result.rules).toEqual([
      { userAgent: "*", allow: "/", disallow: ["/*/home", "/*/profile"] },
    ]);
    expect(result.sitemap).toBe("http://localhost:3000/sitemap.xml");
  });
});
