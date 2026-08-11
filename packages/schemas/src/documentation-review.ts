import { z } from "zod";
import { DocumentationCategoryKeySchema } from "./documentation-category";
import { DocumentationUuidSchema } from "./documentation-common";

export const FactualContentBlockSchema = z
  .object({
    type: z.enum(["fact", "decision", "date", "figure", "constraint", "explanation", "open_point"]),
    text: z.string().trim().min(1).max(20_000),
    informationItemIds: z.array(DocumentationUuidSchema).min(1),
    openPointId: DocumentationUuidSchema.nullable().optional(),
  })
  .strict()
  .superRefine((block, context) => {
    if (block.type === "open_point" && !block.openPointId) {
      context.addIssue({ code: "custom", path: ["openPointId"], message: "An open point requires a stable identifier." });
    }
  });

export const CategoryDraftStatusSchema = z.enum([
  "generating", "pending_review", "correction_generating", "accepted", "discarded", "failed", "superseded",
]);

export const CategoryDraftSummarySchema = z.object({
  id: DocumentationUuidSchema,
  categoryKey: DocumentationCategoryKeySchema,
  sourceRevisionId: DocumentationUuidSchema,
  status: CategoryDraftStatusSchema,
  version: z.number().int().positive(),
  changeSummary: z.string().nullable(),
  createdAt: z.iso.datetime(),
}).strict();

export const CategoryDraftDetailSchema = CategoryDraftSummarySchema.extend({
  blocks: z.array(FactualContentBlockSchema),
  provenanceSummary: z.array(z.object({ label: z.string().min(1), itemCount: z.number().int().positive() }).strict()),
}).strict();

export const CategoryProjectionSchema = z.object({
  categoryKey: DocumentationCategoryKeySchema,
  targetSourceRevisionId: DocumentationUuidSchema.nullable(),
  activeDraft: CategoryDraftSummarySchema.nullable(),
  validatedReferenceId: DocumentationUuidSchema.nullable(),
  version: z.number().int().positive(),
}).strict();

export const CategoryReviewRequestSchema = z.object({
  expectedVersion: z.number().int().positive(),
  instruction: z.string().trim().min(1).max(4_000).optional(),
}).strict();

export const CategoryReviewResultSchema = z.object({
  draft: CategoryDraftSummarySchema,
  operationId: DocumentationUuidSchema.nullable(),
  routingCode: z.enum(["FACTUAL_CORRECTION_QUEUED", "EDITORIAL_INSTRUCTION_REQUIRED"]).nullable(),
}).strict();

export type FactualContentBlock = z.infer<typeof FactualContentBlockSchema>;
export type CategoryDraftDetail = z.infer<typeof CategoryDraftDetailSchema>;
export type CategoryProjection = z.infer<typeof CategoryProjectionSchema>;
