import { z } from "zod";
import { DocumentationUuidSchema } from "./documentation-common";

// The reference document is written for the developer, in one call, from the
// project's documents and the notes they wrote. Every write starts from the
// originals: there is no accumulated state between two writes, which is why a
// note has to be kept rather than applied once.

export const ReferenceBlockSchema = z
  .object({
    // FR-016: a gap the documents never settled is marked where it applies,
    // never smoothed into a sentence that reads as settled.
    kind: z.enum(["paragraph", "gap"]),
    text: z.string().trim().min(1).max(20_000),
    // Set on a gap: which open point it stands for, so it can be answered
    // where it appears rather than on a list somewhere else.
    pointId: z.string().min(1).max(64).nullable().optional(),
  })
  .strict();

export const ReferencePartSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    blocks: z.array(ReferenceBlockSchema).min(1),
    // FR-004: which documents this part drew on. Coarser than the per-sentence
    // provenance it replaces, and honest about it.
    documentTitles: z.array(z.string().min(1)),
  })
  .strict();

// What the write could not settle. Display data carried with the document:
// answering one records a note, and the point does not come back because the
// answer is in the next write's input.
export const ReferencePointSchema = z
  .object({
    id: z.string().min(1).max(64),
    question: z.string().trim().min(1).max(2_000),
    why: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const NoteSchema = z
  .object({
    id: DocumentationUuidSchema,
    content: z.string().min(1),
    // A frozen copy of what prompted it. Copied, never pointed at: the next
    // write remakes the document, so the paragraph will not exist.
    context: z.string().nullable(),
    authorName: z.string().min(1),
    createdAt: z.iso.datetime(),
  })
  .strict();

// An answer to an open point and a correction to a paragraph are the same
// thing: a note. `context` carries whichever one was on screen (FR-012).
export const AddNoteRequestSchema = z
  .object({
    content: z.string().trim().min(1).max(4_000),
    context: z.string().trim().min(1).max(20_000).nullable().optional(),
  })
  .strict();

export const NoteListSchema = z
  .object({ notes: z.array(NoteSchema) })
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
    status: ReferenceDocumentStatusSchema,
    outcome: ReferenceDocumentOutcomeSchema.nullable(),
    locale: z.string().min(2).max(8),
    parts: z.array(ReferencePartSchema),
    points: z.array(ReferencePointSchema),
    // FR-017: titles of documents the write could make nothing of. An upload
    // mistake is raised by name rather than silently ignored.
    unrelatedDocuments: z.array(z.string().min(1)),
    failureCode: z.string().trim().min(1).max(128).nullable(),
    createdAt: z.iso.datetime(),
    version: z.number().int().positive(),
  })
  .strict();

// What the working page shows instead of a hundred rows: the state of the
// source in a sentence.
export const ReferenceSummarySchema = z
  .object({
    documentCount: z.number().int().nonnegative(),
    noteCount: z.number().int().nonnegative(),
    openPointCount: z.number().int().nonnegative(),
    needsRewrite: z.boolean(),
    // Null until one has been written. Distinguishes "never written" from
    // "written and being rewritten", which the developer must be able to tell
    // apart before relying on it.
    document: ReferenceDocumentViewSchema.nullable(),
  })
  .strict();

export type ReferenceBlock = z.infer<typeof ReferenceBlockSchema>;
export type ReferencePoint = z.infer<typeof ReferencePointSchema>;
export type Note = z.infer<typeof NoteSchema>;
export type AddNoteRequest = z.infer<typeof AddNoteRequestSchema>;
export type NoteList = z.infer<typeof NoteListSchema>;
export type ReferencePart = z.infer<typeof ReferencePartSchema>;
export type ReferenceDocumentView = z.infer<typeof ReferenceDocumentViewSchema>;
export type ReferenceSummary = z.infer<typeof ReferenceSummarySchema>;
