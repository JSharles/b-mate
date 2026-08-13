import { describe, expect, it } from "vitest";
import {
  ConfirmDocumentRemovalSchema,
  DocumentRemovalPreviewSchema,
} from "./document-removal";

const UUID = "00000000-0000-4000-8000-000000000001";

describe("document removal", () => {
  it("requires explicit confirmation", () =>
    expect(
      ConfirmDocumentRemovalSchema.safeParse({
        expectedDocumentVersion: 1,
        confirmed: false,
      }).success,
    ).toBe(false));

  // Claimed at the version the contributor was shown, so a document that moved
  // under the confirmation is refused rather than removed on a decision taken
  // about something else.
  it("carries the version the decision was taken about", () =>
    expect(
      ConfirmDocumentRemovalSchema.safeParse({
        expectedDocumentVersion: 3,
        confirmed: true,
      }).success,
    ).toBe(true));

  // What the contributor needs before confirming is what the project is left
  // with — removing the last document leaves one that cannot write a reference
  // document at all.
  it("says what would remain", () => {
    const preview = DocumentRemovalPreviewSchema.parse({
      documentId: UUID,
      documentVersion: 3,
      title: "Cahier des charges",
      remainingDocumentCount: 0,
      referenceNeedsRewrite: true,
    });

    expect(preview.remainingDocumentCount).toBe(0);
  });
});
