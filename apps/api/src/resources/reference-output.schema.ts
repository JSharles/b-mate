import { z } from 'zod';
import { RESOURCE_CATEGORY_KEYS } from './resource-categories';

// Internal to this module — never crosses the API boundary. Narrows the
// analysis provider's structured tool-use response before any of it is
// persisted.
//
// The provider's tool schema already constrains the shape; validating again
// here is deliberate defence in depth at a third-party boundary
// (Constitution II), and it is what turns a truncated response into a clean
// "this document failed" rather than a half-written reference layer.

// specs/015 research.md Decision 1. Each entry carries two things, and the
// distinction matters: `extract` is what THIS document contributes to that
// category, kept so the category can later be rebuilt from the documents that
// remain when one is deleted; `reference` is the existing content and that
// extract merged into one body.
// specs/015 FR-021/FR-022. A question earns its place only if the answer would
// change what the client is eventually told; `rank` is that impact, lowest
// first. Absent when the document raised nothing worth asking — which is the
// common case, and deliberately so.
export const ReferenceQuestionOutputSchema = z.object({
  question: z.string().min(1),
  rank: z.number().int().positive(),
});
export type ReferenceQuestionOutput = z.infer<
  typeof ReferenceQuestionOutputSchema
>;

export const ReferenceCategoryUpdateSchema = z.object({
  categoryKey: z.enum(RESOURCE_CATEGORY_KEYS),
  extract: z.string().min(1),
  reference: z.string().min(1),
  questions: z.array(ReferenceQuestionOutputSchema).optional(),
});
export type ReferenceCategoryUpdate = z.infer<
  typeof ReferenceCategoryUpdateSchema
>;

// A category absent from this array is one the document does not address: it
// is not regenerated (FR-005). An empty array means the document contributed
// nothing at all, which the caller turns into a failed resource rather than a
// silent no-op.
export const ReferenceUpdateOutputSchema = z.object({
  categories: z.array(ReferenceCategoryUpdateSchema),
});

// A rebuild produces one category's body and nothing else — no `extract`,
// because nothing new is being contributed: it is a re-merge of extracts that
// already exist, optionally steered by the contributor's instruction.
export const ReferenceRebuildOutputSchema = z.object({
  reference: z.string().min(1),
  questions: z.array(ReferenceQuestionOutputSchema).optional(),
});

// specs/015 FR-011: both locales in one request, which is what structurally
// guarantees they say the same thing rather than leaving it to be reconciled.
export const ClientContentOutputSchema = z.object({
  contentEn: z.string().min(1),
  contentFr: z.string().min(1),
});
