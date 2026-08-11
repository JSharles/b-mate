import { describe, expect, it } from "vitest";
import { CategoryDraftDetailSchema, FactualContentBlockSchema } from "./documentation-review";

const id = "123e4567-e89b-42d3-a456-426614174000";

describe("documentation review contracts", () => {
  it("requires stable open-point identifiers", () => {
    expect(FactualContentBlockSchema.safeParse({ type: "open_point", text: "À confirmer", informationItemIds: [id] }).success).toBe(false);
  });

  it("keeps a draft pinned to a source revision", () => {
    expect(CategoryDraftDetailSchema.parse({ id, categoryKey: "overview", sourceRevisionId: id, status: "pending_review", version: 1, changeSummary: null, createdAt: new Date().toISOString(), blocks: [], provenanceSummary: [] }).sourceRevisionId).toBe(id);
  });
});
