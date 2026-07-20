import { describe, expect, it } from "vitest";
import { SITE_URL } from "./site-url";

describe("SITE_URL", () => {
  it("falls back to localhost when NEXT_PUBLIC_SITE_URL isn't set", () => {
    expect(SITE_URL).toBe("http://localhost:3000");
  });
});
