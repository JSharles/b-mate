import { z } from 'zod';

// Internal to this module only — never crosses the API boundary to the
// frontend, so it does not belong in packages/schemas (see
// specs/007-current-task-vulgarization data-model.md). Validates the LLM's
// structured tool-use response before it is persisted.
export const VulgarizationOutputSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
});
export type VulgarizationOutput = z.infer<typeof VulgarizationOutputSchema>;
