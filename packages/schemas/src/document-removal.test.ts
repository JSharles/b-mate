import { describe, expect, it } from "vitest";
import { ConfirmDocumentRemovalSchema } from "./document-removal";

describe("document removal", () => {
  it("requires explicit confirmation and optimistic tokens", () =>
    expect(
      ConfirmDocumentRemovalSchema.safeParse({ confirmed: false }).success,
    ).toBe(false));

  it("supports deleting a failed document before a source revision exists", () =>
    expect(
      ConfirmDocumentRemovalSchema.safeParse({
        expectedDocumentVersion: 1,
        expectedSourceRevisionId: null,
        confirmationToken: "a".repeat(64),
        confirmed: true,
      }).success,
    ).toBe(true));
});
