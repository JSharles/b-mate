import { z } from 'zod';

// Internal to this module only — never crosses the API boundary to the
// frontend, so it does not belong in packages/schemas (see
// specs/007-current-task-vulgarization data-model.md). Validates the LLM's
// structured tool-use response before it is persisted.
//
// 2026-08-09: the single `description` field was replaced by three named
// sections (docs/PRODUCT.md "Working notes") — each stays independently
// nullable, since the source material may not support a truthful answer
// for every section (Constitution II, "Never fabricate").
export const VulgarizationOutputSchema = z.object({
  title: z.string(),
  why: z.string().nullable(),
  impact: z.string().nullable(),
  status: z.string().nullable(),
});
export type VulgarizationOutput = z.infer<typeof VulgarizationOutputSchema>;
