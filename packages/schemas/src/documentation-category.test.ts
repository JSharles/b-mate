import { describe, expect, it } from "vitest";
import {
  DOCUMENTATION_CATEGORIES,
  DOCUMENTATION_CATEGORY_KEYS,
  DocumentationCategoryKeySchema,
  documentationCategoryLabel,
} from "./documentation-category";

describe("documentation category taxonomy", () => {
  it("keeps the fixed wire values and product order", () => {
    expect(DOCUMENTATION_CATEGORY_KEYS).toEqual([
      "overview",
      "how_it_works",
      "planning",
      "other",
    ]);
    expect(DOCUMENTATION_CATEGORIES.map(({ key }) => key)).toEqual(
      DOCUMENTATION_CATEGORY_KEYS,
    );
  });

  it("rejects invented categories and localizes labels", () => {
    expect(DocumentationCategoryKeySchema.safeParse("risks").success).toBe(
      false,
    );
    expect(documentationCategoryLabel("how_it_works", "fr")).toBe(
      "Comment ça marche",
    );
    expect(documentationCategoryLabel("how_it_works", "en")).toBe(
      "How it works",
    );
    expect(
      documentationCategoryLabel(
        "missing" as (typeof DOCUMENTATION_CATEGORY_KEYS)[number],
        "fr",
      ),
    ).toBe("missing");
    expect(
      documentationCategoryLabel(
        "missing" as (typeof DOCUMENTATION_CATEGORY_KEYS)[number],
        "en",
      ),
    ).toBe("missing");
  });
});
