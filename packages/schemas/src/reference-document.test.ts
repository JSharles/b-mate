import { describe, expect, it } from "vitest";
import {
  ReferenceBlockSchema,
  ReferenceDocumentViewSchema,
  ReferencePartSchema,
  ReferenceSummarySchema,
} from "./reference-document";

const id = "123e4567-e89b-42d3-a456-426614174000";

const paragraph = {
  kind: "paragraph" as const,
  text: "Le lancement est prévu en octobre.",
  informationItemIds: [id],
};

describe("reference document contracts", () => {
  it("accepts a paragraph resting on a statement", () => {
    expect(ReferenceBlockSchema.parse(paragraph).kind).toBe("paragraph");
  });

  // The guarantee against invention is structural: a passage that rests on
  // nothing cannot be recorded, whatever the model returns.
  it("refuses a passage that rests on nothing", () => {
    expect(
      ReferenceBlockSchema.safeParse({ ...paragraph, informationItemIds: [] })
        .success,
    ).toBe(false);
  });

  it("keeps a gap as its own kind of passage", () => {
    expect(
      ReferenceBlockSchema.parse({ ...paragraph, kind: "open_point" }).kind,
    ).toBe("open_point");
  });

  it("refuses a part with no title", () => {
    expect(
      ReferencePartSchema.safeParse({ title: "  ", blocks: [paragraph] })
        .success,
    ).toBe(false);
  });

  it("refuses an empty part — a heading over nothing says nothing", () => {
    expect(
      ReferencePartSchema.safeParse({ title: "Le projet", blocks: [] }).success,
    ).toBe(false);
  });

  it("carries the language it was written in", () => {
    const view = ReferenceDocumentViewSchema.parse({
      id,
      sourceRevisionId: id,
      status: "ready",
      outcome: "written",
      locale: "fr",
      parts: [{ title: "Le projet", blocks: [paragraph] }],
      citedStatements: [{ id, content: "The launch is planned for October." }],
      failureCode: null,
      createdAt: new Date().toISOString(),
      version: 1,
    });

    expect(view.locale).toBe("fr");
  });

  it("can report that the documents held nothing usable", () => {
    const view = ReferenceDocumentViewSchema.parse({
      id,
      sourceRevisionId: id,
      status: "ready",
      outcome: "nothing_usable",
      locale: "fr",
      parts: [],
      citedStatements: [],
      failureCode: null,
      createdAt: new Date().toISOString(),
      version: 1,
    });

    expect(view.outcome).toBe("nothing_usable");
    expect(view.parts).toEqual([]);
  });

  describe("the summary", () => {
    it("tells a never-written source from a rewritten one", () => {
      const summary = ReferenceSummarySchema.parse({
        statementCount: 100,
        documentCount: 2,
        openPointCount: 2,
        sourceRevisionId: id,
        lastChangedAt: new Date().toISOString(),
        needsRewrite: true,
        document: null,
      });

      expect(summary.document).toBeNull();
      expect(summary.needsRewrite).toBe(true);
    });

    it("accepts a project with no source at all", () => {
      const summary = ReferenceSummarySchema.parse({
        statementCount: 0,
        documentCount: 0,
        openPointCount: 0,
        sourceRevisionId: null,
        lastChangedAt: null,
        needsRewrite: true,
        document: null,
      });

      expect(summary.statementCount).toBe(0);
    });

    it("refuses a leaked internal field", () => {
      expect(
        ReferenceSummarySchema.safeParse({
          statementCount: 0,
          documentCount: 0,
          openPointCount: 0,
          sourceRevisionId: null,
          lastChangedAt: null,
          needsRewrite: true,
          document: null,
          activeReferenceDocumentId: id,
        }).success,
      ).toBe(false);
    });
  });
});
