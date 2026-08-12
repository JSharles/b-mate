import { z } from "zod";
import {
  DocumentationUuidSchema,
  PublicStructuredContentSchema,
} from "./documentation-common";

// A section is authored, so its name is contributor text shown to the client
// as-is — never a translation key (research Decision 7).
export const SectionNameSchema = z.string().trim().min(1).max(120);

// The description of what composition should look for in the canonical source.
// This is the field that decides a section's quality, hence the generous ceiling.
export const SectionInstructionsSchema = z.string().trim().min(1).max(4_000);

// The four editorial dimensions, carried by the section rather than the project
// (research Decision 6). Deliberately declared here rather than imported from
// `editorial-profile`, which this feature retires in its final slice.
export const SectionLengthSchema = z.enum(["concise", "balanced", "detailed"]);
export const SectionPedagogySchema = z.enum([
  "direct",
  "guided",
  "highly_explanatory",
]);
export const SectionTechnicalFamiliaritySchema = z.enum([
  "novice",
  "informed",
  "technical",
]);
export const SectionToneSchema = z.enum([
  "reassuring",
  "neutral",
  "direct",
  "formal",
]);

export const SectionEditorialSchema = z
  .object({
    length: SectionLengthSchema,
    pedagogy: SectionPedagogySchema,
    technicalFamiliarity: SectionTechnicalFamiliaritySchema,
    tone: SectionToneSchema,
  })
  .strict();

// The blocks composition produces. Structurally the same shape feature 016's
// category drafts used; declared separately because `documentation-review` is
// removed once every project has migrated off categories.
export const SectionContentBlockSchema = z
  .object({
    type: z.enum([
      "fact",
      "decision",
      "date",
      "figure",
      "constraint",
      "explanation",
      "open_point",
    ]),
    text: z.string().trim().min(1).max(20_000),
    informationItemIds: z.array(DocumentationUuidSchema).min(1),
    openPointId: DocumentationUuidSchema.nullable().optional(),
  })
  .strict()
  .superRefine((block, context) => {
    if (block.type === "open_point" && !block.openPointId) {
      context.addIssue({
        code: "custom",
        path: ["openPointId"],
        message: "An open point requires a stable identifier.",
      });
    }
  });

export const SectionProposalStatusSchema = z.enum([
  "composing",
  "pending_review",
  "approved",
  "superseded",
  "failed",
]);

// FR-011: a composition that matched nothing must say so, rather than reaching
// for unrelated material to avoid returning an empty set.
export const SectionProposalOutcomeSchema = z.enum([
  "composed",
  "nothing_matched",
]);

export const SectionProposalSummarySchema = z
  .object({
    id: DocumentationUuidSchema,
    sectionId: DocumentationUuidSchema,
    sourceRevisionId: DocumentationUuidSchema,
    status: SectionProposalStatusSchema,
    version: z.number().int().positive(),
    changeSummary: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();

// FR-010: what composition could not resolve travels beside the proposal, never
// inside its content.
export const SectionQuestionSchema = z
  .object({
    id: DocumentationUuidSchema,
    question: z.string().trim().min(1).max(2_000),
    impactExplanation: z.string().trim().min(1).max(2_000),
    relatedInformationItemIds: z.array(DocumentationUuidSchema),
    answeredByAssertionId: DocumentationUuidSchema.nullable(),
  })
  .strict();

export const SectionProposalDetailSchema = SectionProposalSummarySchema.extend({
  outcome: SectionProposalOutcomeSchema.nullable(),
  blocks: z.array(SectionContentBlockSchema),
  questions: z.array(SectionQuestionSchema),
  provenanceSummary: z.array(
    z
      .object({
        label: z.string().min(1),
        itemCount: z.number().int().positive(),
      })
      .strict(),
  ),
  failureCode: z.string().trim().min(1).max(128).nullable(),
}).strict();

export const SectionViewSchema = z
  .object({
    id: DocumentationUuidSchema,
    name: SectionNameSchema,
    instructions: SectionInstructionsSchema,
    editorial: SectionEditorialSchema,
    sortOrder: z.number().int().nonnegative(),
    refreshNeeded: z.boolean(),
    exclusionCount: z.number().int().nonnegative(),
    activeProposal: SectionProposalSummarySchema.nullable(),
    hasPublishedContent: z.boolean(),
    version: z.number().int().positive(),
  })
  .strict();

export const CreateSectionRequestSchema = z
  .object({
    name: SectionNameSchema,
    instructions: SectionInstructionsSchema,
    editorial: SectionEditorialSchema,
  })
  .strict();

// Every field optional so a rename, a retone and an instruction revision are the
// same call; `expectedVersion` is what makes a concurrent edit a 409 rather than
// a silent overwrite.
export const UpdateSectionRequestSchema = z
  .object({
    name: SectionNameSchema.optional(),
    instructions: SectionInstructionsSchema.optional(),
    editorial: SectionEditorialSchema.optional(),
    expectedVersion: z.number().int().positive(),
  })
  .strict()
  .refine(
    (body) =>
      body.name !== undefined ||
      body.instructions !== undefined ||
      body.editorial !== undefined,
    { message: "An update must change at least one field." },
  );

// Reordering carries the full ordered set, so the resulting order is never a
// function of what the server already held.
export const ReorderSectionsRequestSchema = z
  .object({ orderedSectionIds: z.array(DocumentationUuidSchema).min(1) })
  .strict()
  .refine(
    (body) =>
      new Set(body.orderedSectionIds).size === body.orderedSectionIds.length,
    { message: "A section may appear only once in the order." },
  );

// FR-015: a relevance correction binds one statement to one section. The reason
// is shown back to the contributor and never sent to the model — the exclusion
// is enforced by filtering composition's input (research Decision 5).
export const CreateSectionExclusionRequestSchema = z
  .object({
    informationItemId: DocumentationUuidSchema,
    reason: z.string().trim().min(1).max(1_000),
  })
  .strict();

export const SectionExclusionViewSchema = z
  .object({
    informationItemId: DocumentationUuidSchema,
    reason: z.string().min(1),
    excerpt: z.string().min(1),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const ApproveSectionProposalRequestSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export const AnswerSectionQuestionRequestSchema = z
  .object({ answer: z.string().trim().min(1).max(4_000) })
  .strict();

// What the client reads. FR-023: a section with no published content is absent
// from this list rather than present and empty.
export const PublicSectionSchema = z
  .object({
    id: DocumentationUuidSchema,
    name: SectionNameSchema,
    content: PublicStructuredContentSchema,
  })
  .strict();

export const PublicSectionsViewSchema = z
  .object({ sections: z.array(PublicSectionSchema) })
  .strict();

export type SectionEditorial = z.infer<typeof SectionEditorialSchema>;
export type SectionContentBlock = z.infer<typeof SectionContentBlockSchema>;
export type SectionProposalStatus = z.infer<typeof SectionProposalStatusSchema>;
export type SectionProposalSummary = z.infer<
  typeof SectionProposalSummarySchema
>;
export type SectionProposalDetail = z.infer<typeof SectionProposalDetailSchema>;
export type SectionQuestion = z.infer<typeof SectionQuestionSchema>;
export type SectionView = z.infer<typeof SectionViewSchema>;
export type CreateSectionRequest = z.infer<typeof CreateSectionRequestSchema>;
export type UpdateSectionRequest = z.infer<typeof UpdateSectionRequestSchema>;
export type SectionExclusionView = z.infer<typeof SectionExclusionViewSchema>;
export type PublicSection = z.infer<typeof PublicSectionSchema>;
export type PublicSectionsView = z.infer<typeof PublicSectionsViewSchema>;
