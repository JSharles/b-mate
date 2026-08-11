import { z } from "zod";
import { DocumentationUuidSchema } from "./documentation-common";
import { PublicClientCategorySchema } from "./client-release";

export const EditorialProfileValuesSchema = z.object({
  length: z.enum(["concise", "balanced", "detailed"]),
  pedagogy: z.enum(["direct", "guided", "highly_explanatory"]),
  technicalFamiliarity: z.enum(["novice", "informed", "technical"]),
  tone: z.enum(["reassuring", "neutral", "direct", "formal"]),
  guidance: z.string().trim().max(2_000).nullable(),
}).strict();

export const EditorialProfileViewSchema = EditorialProfileValuesSchema.extend({
  revisionId: DocumentationUuidSchema.nullable(),
  sequence: z.number().int().nonnegative(),
  version: z.number().int().positive(),
}).strict();

export const EditorialProposalRequestSchema = EditorialProfileValuesSchema.extend({ expectedVersion: z.number().int().positive() }).strict();
export const EditorialProposalStatusSchema = z.enum(["preview_pending", "preview_ready", "confirmed", "cancelled", "failed", "expired", "saved_without_preview"]);
export const EditorialProposalViewSchema = z.object({
  id: DocumentationUuidSchema,
  status: EditorialProposalStatusSchema,
  version: z.number().int().positive(),
  values: EditorialProfileValuesSchema,
  before: PublicClientCategorySchema.nullable(),
  after: PublicClientCategorySchema.nullable(),
  hasRepresentativeContent: z.boolean(),
  releaseProgress: z.object({ ready: z.number().int().nonnegative(), expected: z.number().int().nonnegative() }).nullable(),
}).strict();
export const ConfirmEditorialProposalRequestSchema = z.object({ expectedVersion: z.number().int().positive(), confirmed: z.literal(true) }).strict();

export type EditorialProfileValues = z.infer<typeof EditorialProfileValuesSchema>;
export type EditorialProposalView = z.infer<typeof EditorialProposalViewSchema>;
