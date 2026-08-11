import { describe, expect, it } from "vitest";
import {
  CursorSchema,
  ExpectedSourceRevisionSchema,
  ExpectedVersionSchema,
  PublicStructuredContentSchema,
  SafeErrorSchema,
  StructuredContentSchema,
  createCursorPageSchema,
} from "./documentation-common";

const UUID = "00000000-0000-4000-8000-000000000001";

describe("documentation common contracts", () => {
  it("validates attributable structured blocks", () => {
    expect(
      StructuredContentSchema.parse({
        blocks: [
          {
            kind: "paragraph",
            text: "Une contrainte confirmée.",
            informationItemIds: [UUID],
            clarificationIds: [],
          },
        ],
      }),
    ).toBeDefined();
    expect(StructuredContentSchema.safeParse({ blocks: [] }).success).toBe(
      false,
    );
    expect(
      StructuredContentSchema.safeParse({
        blocks: [
          {
            kind: "paragraph",
            text: "   ",
            informationItemIds: [UUID],
            clarificationIds: [],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("keeps public blocks free of internal identifiers", () => {
    expect(
      PublicStructuredContentSchema.safeParse({
        blocks: [
          {
            kind: "paragraph",
            text: "Client-safe",
            informationItemIds: [UUID],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts safe errors but rejects provider diagnostics", () => {
    expect(
      SafeErrorSchema.parse({ code: "DOCUMENT_UNREADABLE", parameters: {} }),
    ).toEqual({ code: "DOCUMENT_UNREADABLE", parameters: {} });
    expect(
      SafeErrorSchema.safeParse({
        code: "GENERATION_TEMPORARILY_DELAYED",
        provider: "anthropic",
        rawMessage: "credit exhausted",
      }).success,
    ).toBe(false);
  });

  it("validates opaque cursors, cursor pages, and concurrency tokens", () => {
    const pageSchema = createCursorPageSchema(ExpectedVersionSchema);
    expect(
      pageSchema.parse({
        items: [{ expectedVersion: 1 }],
        total: 1,
        nextCursor: "opaque:cursor",
      }),
    ).toBeDefined();
    expect(CursorSchema.safeParse("").success).toBe(false);
    expect(
      ExpectedVersionSchema.safeParse({ expectedVersion: 0 }).success,
    ).toBe(false);
    expect(
      ExpectedSourceRevisionSchema.parse({ expectedSourceRevisionId: null }),
    ).toEqual({ expectedSourceRevisionId: null });
  });
});
