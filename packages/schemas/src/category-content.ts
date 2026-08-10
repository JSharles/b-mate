import { z } from 'zod';
import { ResourceCategoryKeySchema } from './resource-category';

// specs/015-document-reference-layer. The unit of content is the category, not
// the document — 014 made it the document and the client was left reconciling
// several blocks that talked about the same thing.
//
// Two layers sit behind these shapes. The **reference** layer is the
// contributor's own documentation: organised, exhaustive, in ordinary
// professional language, never vulgarized. The **client** layer is derived
// from it and is the only thing a client ever reads.

// Why a draft exists — shown in the review queue so a contributor knows what
// they are looking at without opening it.
export const DraftTriggerSchema = z.enum([
  'document_added',
  'document_removed',
  'regeneration_requested',
]);
export type DraftTrigger = z.infer<typeof DraftTriggerSchema>;

export const ReferenceDraftStatusSchema = z.enum([
  // A rebuild is in flight: nothing to read yet, and neither approve nor
  // refuse applies until it lands.
  'generating',
  'pending_review',
  'awaiting_answers',
]);
export type ReferenceDraftStatus = z.infer<typeof ReferenceDraftStatusSchema>;

// A regeneration awaiting validation. At most one per category — the queue is
// a list of independent items (FR-014a), never grouped by the document that
// triggered them: a document touching three categories appears three times,
// and each is disposed of on its own.
//
// `attempt` is what the UI needs to explain that the cap is near, and to
// disable the instruction path once it is reached.
// specs/015 FR-021 to FR-023. A question exists only where the answer would
// change what the client is eventually told. It never blocks: an unanswered
// one leaves the point explicitly marked in the reference text, which is
// written at the same time as the question rather than patched in later.
export const ReferenceQuestionSchema = z.object({
  id: z.uuid(),
  question: z.string(),
});
export type ReferenceQuestion = z.infer<typeof ReferenceQuestionSchema>;

export const AnswerQuestionsRequestSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.uuid(),
        answer: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1),
});
export type AnswerQuestionsRequest = z.infer<
  typeof AnswerQuestionsRequestSchema
>;

export const ReferenceDraftSchema = z.object({
  categoryKey: ResourceCategoryKeySchema,
  status: ReferenceDraftStatusSchema,
  content: z.string(),
  trigger: DraftTriggerSchema,
  // The document that caused this draft, by name — null when it was removed,
  // or when the draft came from an explicit regeneration request.
  triggerDocumentTitle: z.string().nullable(),
  attempt: z.number().int().positive(),
  // Outstanding questions only, most consequential first. Empty is the normal
  // case — a draft with nothing worth asking about.
  questions: z.array(ReferenceQuestionSchema),
  createdAt: z.iso.datetime(),
});
export type ReferenceDraft = z.infer<typeof ReferenceDraftSchema>;

// Validated reference content. Single-language by design: this is the
// contributor's working document, and the client layer below already produces
// both locales (spec Assumptions).
export const CategoryReferenceSchema = z.object({
  categoryKey: ResourceCategoryKeySchema,
  content: z.string(),
  updatedAt: z.iso.datetime(),
});
export type CategoryReference = z.infer<typeof CategoryReferenceSchema>;

// What a client reads: one continuous text per category, already resolved to
// the caller's locale server-side. A category with no content is *absent* from
// the response rather than present-and-empty — that absence is the only thing
// producing "no empty tab" (FR-012).
export const CategoryContentSchema = z.object({
  categoryKey: ResourceCategoryKeySchema,
  content: z.string(),
});
export type CategoryContent = z.infer<typeof CategoryContentSchema>;

// Refusing a draft offers two ways out: discard it, or send it back with an
// instruction in the contributor's own words (FR-015). They instruct; they do
// not rewrite.
export const RegenerateDraftRequestSchema = z.object({
  instruction: z.string().trim().min(1).max(2000),
});
export type RegenerateDraftRequest = z.infer<
  typeof RegenerateDraftRequestSchema
>;
