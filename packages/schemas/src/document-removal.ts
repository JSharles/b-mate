import { z } from "zod";
import { DocumentationUuidSchema } from "./documentation-common";
export const DocumentRemovalPreviewSchema = z
  .object({
    documentId: DocumentationUuidSchema,
    documentVersion: z.number().int().positive(),
    sourceRevisionId: DocumentationUuidSchema.nullable(),
    observationCount: z.number().int().nonnegative(),
    supportedItemCount: z.number().int().nonnegative(),
    soleSupportItemCount: z.number().int().nonnegative(),
    confirmationToken: z.string().min(16),
  })
  .strict();
export const ConfirmDocumentRemovalSchema = z
  .object({
    expectedDocumentVersion: z.number().int().positive(),
    expectedSourceRevisionId: DocumentationUuidSchema.nullable(),
    confirmationToken: z.string().min(16),
    confirmed: z.literal(true),
  })
  .strict();
export type DocumentRemovalPreview = z.infer<
  typeof DocumentRemovalPreviewSchema
>;
export type ConfirmDocumentRemoval = z.infer<
  typeof ConfirmDocumentRemovalSchema
>;
