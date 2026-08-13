import { describe, expect, it } from "vitest";
import {
  AddNoteRequestSchema,
  NoteSchema,
  ReferenceBlockSchema,
  ReferenceDocumentViewSchema,
  ReferencePartSchema,
  ReferenceSummarySchema,
} from "./reference-document";

const id = "123e4567-e89b-42d3-a456-426614174000";

const paragraph = {
  kind: "paragraph" as const,
  text: "Le lancement est prévu en octobre.",
};

const part = {
  title: "Le projet",
  blocks: [paragraph],
  documentTitles: ["Cahier des charges"],
};

function view(overrides: Record<string, unknown> = {}) {
  return {
    id,
    status: "ready",
    outcome: "written",
    locale: "fr",
    parts: [part],
    points: [],
    unrelatedDocuments: [],
    failureCode: null,
    createdAt: new Date().toISOString(),
    version: 1,
    ...overrides,
  };
}

describe("reference document contracts", () => {
  it("accepts a paragraph", () => {
    expect(ReferenceBlockSchema.parse(paragraph).kind).toBe("paragraph");
  });

  // FR-016: what the documents never settled is marked where it applies, never
  // smoothed into a sentence that reads as settled.
  it("keeps a gap as its own kind of passage, naming the point it stands for", () => {
    const gap = ReferenceBlockSchema.parse({
      kind: "gap",
      text: "La date de lancement n'est pas fixée.",
      pointId: "p0",
    });

    expect(gap.kind).toBe("gap");
    expect(gap.pointId).toBe("p0");
  });

  it("refuses a part with no title", () => {
    expect(ReferencePartSchema.safeParse({ ...part, title: "  " }).success).toBe(
      false,
    );
  });

  it("refuses an empty part — a heading over nothing says nothing", () => {
    expect(ReferencePartSchema.safeParse({ ...part, blocks: [] }).success).toBe(
      false,
    );
  });

  it("carries the language it was written in", () => {
    expect(ReferenceDocumentViewSchema.parse(view()).locale).toBe("fr");
  });

  // FR-007: documents holding nothing usable produce a document that says so,
  // rather than an empty one the developer has to interpret.
  it("can report that the documents held nothing usable", () => {
    const parsed = ReferenceDocumentViewSchema.parse(
      view({ outcome: "nothing_usable", parts: [] }),
    );

    expect(parsed.outcome).toBe("nothing_usable");
    expect(parsed.parts).toEqual([]);
  });

  // FR-017: an upload mistake is named rather than woven in.
  it("names a document it could make nothing of", () => {
    const parsed = ReferenceDocumentViewSchema.parse(
      view({ unrelatedDocuments: ["Facture EDF.pdf"] }),
    );

    expect(parsed.unrelatedDocuments).toEqual(["Facture EDF.pdf"]);
  });

  describe("a note", () => {
    // FR-012: an answer and a correction are the same thing. What was on
    // screen travels with it, frozen, because the next write remakes the
    // document and the paragraph will not exist any more.
    it("carries what prompted it, and stands alone without it", () => {
      expect(
        AddNoteRequestSchema.parse({
          content: "Le lancement est en octobre.",
          context: "Quelle date de lancement ?",
        }).context,
      ).toBe("Quelle date de lancement ?");
      expect(
        AddNoteRequestSchema.safeParse({ content: "Octobre." }).success,
      ).toBe(true);
    });

    it("refuses an empty one", () => {
      expect(AddNoteRequestSchema.safeParse({ content: "   " }).success).toBe(
        false,
      );
    });

    it("says who wrote it", () => {
      const note = NoteSchema.parse({
        id,
        content: "Le lancement est en octobre.",
        context: null,
        authorName: "Jean-Charles Barq",
        createdAt: new Date().toISOString(),
      });

      expect(note.authorName).toBe("Jean-Charles Barq");
    });
  });

  describe("the summary", () => {
    it("tells a never-written source from a rewritten one", () => {
      const summary = ReferenceSummarySchema.parse({
        documentCount: 2,
        noteCount: 3,
        openPointCount: 2,
        needsRewrite: true,
        document: null,
      });

      expect(summary.document).toBeNull();
      expect(summary.needsRewrite).toBe(true);
    });

    it("accepts a project with nothing at all", () => {
      const summary = ReferenceSummarySchema.parse({
        documentCount: 0,
        noteCount: 0,
        openPointCount: 0,
        needsRewrite: true,
        document: null,
      });

      expect(summary.documentCount).toBe(0);
    });

    it("refuses a leaked internal field", () => {
      expect(
        ReferenceSummarySchema.safeParse({
          documentCount: 0,
          noteCount: 0,
          openPointCount: 0,
          needsRewrite: true,
          document: null,
          activeReferenceDocumentId: id,
        }).success,
      ).toBe(false);
    });
  });
});
