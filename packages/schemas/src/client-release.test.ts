import { describe, expect, it } from "vitest";
import { PublicClientCategorySchema } from "./client-release";

describe("client release contracts", () => {
  it("rejects internal identifiers in public serialization", () => {
    expect(PublicClientCategorySchema.safeParse({ categoryKey: "overview", blocks: [], sourceRevisionId: "internal" }).success).toBe(false);
  });
});
