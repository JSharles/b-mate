import { z } from "zod";
import { DocumentationUuidSchema } from "./documentation-common";

// The reference document is written for the developer, from the project's
// canonical source. Nothing reads it back — composition still draws only on the
// canonical source (specs/017 FR-009). A reading that becomes an input is how a
// product ends up holding two accounts of the same project.

export const ReferenceBlockSchema = z
  .object({
    // FR-011: a gap the documents never settled is marked where it applies,
    // never smoothed into a sentence that reads as settled.
    kind: z.enum(["paragraph", "open_point"]),
    text: z.string().trim().min(1).max(20_000),
    // What this passage rests on. Checked against what was sent, so a sentence
    // with no source cannot survive.
    informationItemIds: z.array(DocumentationUuidSchema).min(1),
  })
  .strict();

export const ReferencePartSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    blocks: z.array(ReferenceBlockSchema).min(1),
  })
  .strict();

export const ReferenceDocumentStatusSchema = z.enum([
  "writing",
  "ready",
  "superseded",
  "failed",
]);

// FR-007: documents holding nothing usable produce a document that says so,
// rather than an empty one the developer has to interpret.
export const ReferenceDocumentOutcomeSchema = z.enum([
  "written",
  "nothing_usable",
]);

export const ReferenceDocumentViewSchema = z
  .object({
    id: DocumentationUuidSchema,
    sourceRevisionId: DocumentationUuidSchema,
    status: ReferenceDocumentStatusSchema,
    outcome: ReferenceDocumentOutcomeSchema.nullable(),
    locale: z.string().min(2).max(8),
    parts: z.array(ReferencePartSchema),
    // The statements the document cites, with their own wording. The document
    // holds prose; correcting a statement needs the statement, and without this
    // the correction action would open on an empty field (FR-005).
    citedStatements: z.array(
      z
        .object({
          id: DocumentationUuidSchema,
          content: z.string().min(1),
        })
        .strict(),
    ),
    failureCode: z.string().trim().min(1).max(128).nullable(),
    createdAt: z.iso.datetime(),
    version: z.number().int().positive(),
  })
  .strict();

// What the working page shows instead of a hundred rows: the state of the
// source in a sentence.
export const ReferenceSummarySchema = z
  .object({
    statementCount: z.number().int().nonnegative(),
    documentCount: z.number().int().nonnegative(),
    openPointCount: z.number().int().nonnegative(),
    sourceRevisionId: DocumentationUuidSchema.nullable(),
    lastChangedAt: z.iso.datetime().nullable(),
    needsRewrite: z.boolean(),
    // Null until one has been written. Distinguishes "never written" from
    // "written and being rewritten", which the developer must be able to tell
    // apart before relying on it.
    document: ReferenceDocumentViewSchema.nullable(),
  })
  .strict();

export type ReferenceBlock = z.infer<typeof ReferenceBlockSchema>;
export type ReferencePart = z.infer<typeof ReferencePartSchema>;
export type ReferenceDocumentView = z.infer<typeof ReferenceDocumentViewSchema>;
export type ReferenceSummary = z.infer<typeof ReferenceSummarySchema>;
