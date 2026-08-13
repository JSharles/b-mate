import { describe, expect, it } from "vitest";
import {
  CursorSchema,
  ExpectedVersionSchema,
  PublicStructuredContentSchema,
  SafeErrorSchema,
  StructuredContentSchema,
  createCursorPageSchema,
} from "./documentation-common";

const UUID = "00000000-0000-4000-8000-000000000001";

describe("documentation common contracts", () => {
  it("validates structured blocks", () => {
    expect(
      StructuredContentSchema.parse({
        blocks: [{ kind: "paragraph", text: "Une contrainte confirmée." }],
      }),
    ).toBeDefined();
    expect(StructuredContentSchema.safeParse({ blocks: [] }).success).toBe(
      false,
    );
    expect(
      StructuredContentSchema.safeParse({
        blocks: [{ kind: "paragraph", text: "   " }],
      }).success,
    ).toBe(false);
  });

  // What the reference document leaves unsettled stays unsettled in a section
  // rather than being written around.
  it("keeps an open point as its own kind of block", () => {
    expect(
      StructuredContentSchema.parse({
        blocks: [{ kind: "open_point", text: "La date n'est pas fixée." }],
      }).blocks[0].kind,
    ).toBe("open_point");
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
  });
});
