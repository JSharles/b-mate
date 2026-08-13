import { z } from "zod";
import {
  DocumentationUuidSchema,
  PublicStructuredContentSchema,
} from "./documentation-common";

// A section is authored, so its name is contributor text shown to the client
// as-is — never a translation key (research Decision 7).
export const SectionNameSchema = z.string().trim().min(1).max(120);

// The description of what composition should look for in the reference
// document. This is the field that decides a section's quality, hence the
// generous ceiling.
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

// A section is prose or a roadmap, decided once at creation (FR-001). The kind
// is not an editorial setting: it decides what the model is asked for and what
// the client receives, which is why it cannot change under a published section.
export const SectionKindSchema = z.enum(["prose", "roadmap"]);

// Whether it was read from the reference document or added by hand. The
// developer sees the difference — trusting a roadmap means knowing what came
// from where — and the client does not, because by then both are the
// developer's word.
export const MilestoneOriginSchema = z.enum(["document", "developer"]);

// What sits inside a long milestone. "Développement" is one word for three
// months; naming Feature 1, Feature 2, Feature 3 is the difference between a
// roadmap that informs and one that reassures.
//
// Its "when" may be absent, because a feature inside a phase often has no date
// of its own and inventing one would be inventing. Its title may not: a step
// with no name is a marker over nothing.
//
// **It carries no sub-steps.** The roadmap is two levels deep, and the ceiling
// is the type rather than a rule someone has to remember.
export const SubstepSchema = z
  .object({
    id: DocumentationUuidSchema,
    when: z.string().trim().min(1).max(120).nullable(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(2_000).nullable(),
    origin: MilestoneOriginSchema,
  })
  .strict();

// A milestone carries when, what, optionally why it matters, and optionally
// what sits inside it.
//
// "When" is text, never a date. Documents say "Q3 2026", "après la phase
// pilote", "mi-octobre". A date type would either lose those or invent a
// precision the documents never gave, and order is carried by the list anyway.
export const MilestoneSchema = z
  .object({
    id: DocumentationUuidSchema,
    when: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(2_000).nullable(),
    substeps: z.array(SubstepSchema),
    origin: MilestoneOriginSchema,
  })
  .strict();

// What the developer sends back after editing: ids only for the ones they kept,
// so a new step is unambiguous and cannot collide with an existing id. The
// whole tree travels, both levels of it.
export const SubstepDraftSchema = SubstepSchema.omit({
  id: true,
  origin: true,
}).extend({ id: DocumentationUuidSchema.nullable() });

export const MilestoneDraftSchema = MilestoneSchema.omit({
  id: true,
  origin: true,
  substeps: true,
}).extend({
  id: DocumentationUuidSchema.nullable(),
  substeps: z.array(SubstepDraftSchema),
});

// The whole ordered set travels, so the result is never a function of what the
// server already held — the same reason reordering carries every id.
export const ReplaceMilestonesRequestSchema = z
  .object({
    milestones: z.array(MilestoneDraftSchema),
    expectedProposalVersion: z.number().int().positive(),
  })
  .strict();

// Where the project stands. Null is a real answer: a plan with no position
// claimed reads better than one defaulting to its first step.
export const SetCurrentMilestoneRequestSchema = z
  .object({
    milestoneId: DocumentationUuidSchema.nullable(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

// The blocks composition produces. A section is a view of the reference
// document, so its blocks are shaped like the document's: prose, and what the
// document leaves open kept as its own kind.
export const SectionContentBlockSchema = z
  .object({
    kind: z.enum(["paragraph", "open_point"]),
    text: z.string().trim().min(1).max(20_000),
  })
  .strict();

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
    referenceDocumentId: DocumentationUuidSchema,
    status: SectionProposalStatusSchema,
    version: z.number().int().positive(),
    changeSummary: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .strict();

// A proposal carries prose blocks or milestones, never both: the section's kind
// decides which, and it cannot change once the section exists.
export const SectionProposalDetailSchema = SectionProposalSummarySchema.extend({
  outcome: SectionProposalOutcomeSchema.nullable(),
  blocks: z.array(SectionContentBlockSchema),
  milestones: z.array(MilestoneSchema),
  failureCode: z.string().trim().min(1).max(128).nullable(),
}).strict();

// A roadmap has neither a brief nor a register: its brief is fixed, and a
// milestone date has no tone. So the fields are absent rather than filled with
// something nobody chose.
export const SectionViewSchema = z
  .object({
    id: DocumentationUuidSchema,
    kind: SectionKindSchema,
    name: SectionNameSchema,
    instructions: SectionInstructionsSchema.nullable(),
    editorial: SectionEditorialSchema.nullable(),
    currentMilestoneId: DocumentationUuidSchema.nullable(),
    sortOrder: z.number().int().nonnegative(),
    refreshNeeded: z.boolean(),
    activeProposal: SectionProposalSummarySchema.nullable(),
    hasPublishedContent: z.boolean(),
    version: z.number().int().positive(),
  })
  .strict();

// Choosing a roadmap does not add controls, it removes them: the request
// collapses to a name.
export const CreateSectionRequestSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("prose"),
      name: SectionNameSchema,
      instructions: SectionInstructionsSchema,
      editorial: SectionEditorialSchema,
    })
    .strict(),
  z.object({ kind: z.literal("roadmap"), name: SectionNameSchema }).strict(),
]);

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

export const ApproveSectionProposalRequestSchema = z
  .object({ expectedVersion: z.number().int().positive() })
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

// Where a step came from is the developer's business, not the client's: by the
// time it is published, both are the developer's word.
export const PublicSubstepSchema = SubstepSchema.omit({ origin: true }).strict();

export const PublicMilestoneSchema = MilestoneSchema.omit({
  origin: true,
  substeps: true,
})
  .extend({ substeps: z.array(PublicSubstepSchema) })
  .strict();

export const PublicSectionsViewSchema = z
  .object({ sections: z.array(PublicSectionSchema) })
  .strict();

export type SectionEditorial = z.infer<typeof SectionEditorialSchema>;
export type SectionKind = z.infer<typeof SectionKindSchema>;
export type Milestone = z.infer<typeof MilestoneSchema>;
export type MilestoneDraft = z.infer<typeof MilestoneDraftSchema>;
export type Substep = z.infer<typeof SubstepSchema>;
export type SubstepDraft = z.infer<typeof SubstepDraftSchema>;
export type PublicMilestone = z.infer<typeof PublicMilestoneSchema>;
export type PublicSubstep = z.infer<typeof PublicSubstepSchema>;
export type ReplaceMilestonesRequest = z.infer<
  typeof ReplaceMilestonesRequestSchema
>;
export type SetCurrentMilestoneRequest = z.infer<
  typeof SetCurrentMilestoneRequestSchema
>;
export type SectionContentBlock = z.infer<typeof SectionContentBlockSchema>;
export type SectionProposalStatus = z.infer<typeof SectionProposalStatusSchema>;
export type SectionProposalSummary = z.infer<
  typeof SectionProposalSummarySchema
>;
export type SectionProposalDetail = z.infer<typeof SectionProposalDetailSchema>;
export type SectionView = z.infer<typeof SectionViewSchema>;
export type CreateSectionRequest = z.infer<typeof CreateSectionRequestSchema>;
export type UpdateSectionRequest = z.infer<typeof UpdateSectionRequestSchema>;
export type PublicSection = z.infer<typeof PublicSectionSchema>;
export type PublicSectionsView = z.infer<typeof PublicSectionsViewSchema>;
