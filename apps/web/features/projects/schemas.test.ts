import { describe, expect, it } from "vitest";
import { CreateProjectFormSchema } from "./schemas";

describe("CreateProjectFormSchema", () => {
  it("accepts a non-empty title", () => {
    const result = CreateProjectFormSchema.safeParse({ title: "My project" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty title", () => {
    const result = CreateProjectFormSchema.safeParse({ title: "" });
    expect(result.success).toBe(false);
  });
});
