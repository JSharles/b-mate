import { describe, expect, it } from "vitest";
import { EditorialProfileValuesSchema } from "./editorial-profile";
describe("editorial profile", () => {
  it("accepts a modifiable provider-neutral profile", () => expect(EditorialProfileValuesSchema.parse({ length: "concise", pedagogy: "guided", technicalFamiliarity: "novice", tone: "reassuring", guidance: null }).length).toBe("concise"));
  it("rejects provider/model settings", () => expect(EditorialProfileValuesSchema.safeParse({ length: "concise", pedagogy: "guided", technicalFamiliarity: "novice", tone: "reassuring", guidance: null, model: "x" }).success).toBe(false));
});
