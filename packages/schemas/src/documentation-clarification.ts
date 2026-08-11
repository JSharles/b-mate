import { z } from "zod";
import { createCursorPageSchema, DocumentationUuidSchema } from "./documentation-common";
import { SourceLocatorSchema } from "./documentation-source";

export const ClarificationStatusSchema = z.enum([
  "open",
  "left_open",
  "answered",
  "superseded",
]);

export const ClarificationEvidenceSchema = z
  .object({
    kind: z.enum(["document", "contributor"]),
    originId: DocumentationUuidSchema,
    label: z.string().trim().min(1),
    excerpt: z.string().trim().min(1).nullable(),
    locator: SourceLocatorSchema.nullable(),
  })
  .strict();

export const ClarificationSchema = z
  .object({
    id: DocumentationUuidSchema,
    question: z.string().trim().min(1).max(2_000),
    impactRank: z.number().int().positive(),
    impactExplanation: z.string().trim().min(1).max(2_000),
    status: ClarificationStatusSchema,
    version: z.number().int().positive(),
    detectedInRevisionId: DocumentationUuidSchema,
    informationItemIds: z.array(DocumentationUuidSchema),
    openPointBlockId: DocumentationUuidSchema,
    evidence: z.array(ClarificationEvidenceSchema).min(1),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const ClarificationPageSchema = createCursorPageSchema(ClarificationSchema);

const AnswerResolutionSchema = z
  .object({
    clarificationId: DocumentationUuidSchema,
    expectedVersion: z.number().int().positive(),
    action: z.literal("answer"),
    answer: z.string().trim().min(1).max(10_000),
  })
  .strict();

const LeaveOpenResolutionSchema = z
  .object({
    clarificationId: DocumentationUuidSchema,
    expectedVersion: z.number().int().positive(),
    action: z.literal("leave_open"),
  })
  .strict();

export const ClarificationResolutionInputSchema = z.discriminatedUnion("action", [
  AnswerResolutionSchema,
  LeaveOpenResolutionSchema,
]);

export const ResolveClarificationsRequestSchema = z
  .object({
    expectedSourceRevisionId: DocumentationUuidSchema,
    resolutions: z.array(ClarificationResolutionInputSchema).min(1),
  })
  .strict()
  .superRefine(({ resolutions }, context) => {
    const seen = new Set<string>();
    for (const [index, resolution] of resolutions.entries()) {
      if (seen.has(resolution.clarificationId)) {
        context.addIssue({
          code: "custom",
          path: ["resolutions", index, "clarificationId"],
          message: "A clarification can only be resolved once per request.",
        });
      }
      seen.add(resolution.clarificationId);
    }
  });

export const ClarificationResolutionResultSchema = z
  .object({
    clarificationId: DocumentationUuidSchema,
    status: z.enum(["answered", "left_open"]),
    version: z.number().int().positive(),
    openPointBlockId: DocumentationUuidSchema,
  })
  .strict();

export const ResolveClarificationsResponseSchema = z
  .object({
    items: z.array(ClarificationResolutionResultSchema).min(1),
    sourceRevisionId: DocumentationUuidSchema.nullable(),
  })
  .strict();

export type Clarification = z.infer<typeof ClarificationSchema>;
export type ClarificationPage = z.infer<typeof ClarificationPageSchema>;
export type ClarificationResolutionInput = z.infer<
  typeof ClarificationResolutionInputSchema
>;
export type ResolveClarificationsRequest = z.infer<
  typeof ResolveClarificationsRequestSchema
>;
export type ResolveClarificationsResponse = z.infer<
  typeof ResolveClarificationsResponseSchema
>;
