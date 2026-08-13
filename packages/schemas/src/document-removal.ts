import { z } from "zod";
import { DocumentationUuidSchema } from "./documentation-common";

// Removing a document is removing a document. What the contributor needs to
// know before confirming is what the project is left with, not which statements
// this one alone supported — there are no statements any more (specs/018).
export const DocumentRemovalPreviewSchema = z
  .object({
    documentId: DocumentationUuidSchema,
    documentVersion: z.number().int().positive(),
    title: z.string().min(1),
    remainingDocumentCount: z.number().int().nonnegative(),
    // True when a reference document already exists: it stays readable, and it
    // is owed a rewrite that no longer draws on this document.
    referenceNeedsRewrite: z.boolean(),
  })
  .strict();

export const ConfirmDocumentRemovalSchema = z
  .object({
    expectedDocumentVersion: z.number().int().positive(),
    confirmed: z.literal(true),
  })
  .strict();

export type DocumentRemovalPreview = z.infer<
  typeof DocumentRemovalPreviewSchema
>;
export type ConfirmDocumentRemoval = z.infer<
  typeof ConfirmDocumentRemovalSchema
>;
