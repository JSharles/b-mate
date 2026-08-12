import { describe, expect, it } from "vitest";
import { PublicClientSectionSchema } from "./client-release";

describe("client release contracts", () => {
  it("rejects internal identifiers in public serialization", () => {
    expect(PublicClientSectionSchema.safeParse({ id: "123e4567-e89b-42d3-a456-426614174000", name: "Le projet", blocks: [], sourceRevisionId: "internal" }).success).toBe(false);
  });
});
