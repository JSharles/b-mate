import { z } from 'zod';

// Internal-only — never crosses the API boundary to the frontend (see
// vulgarization-output.schema.ts for the sibling pattern), so this does not
// belong in packages/schemas. Duration, never an absolute date (specs/008
// research.md Decision 3) — the service computes the actual date itself.
export const TaskEstimateOutputSchema = z.object({
  estimatedDurationDays: z.number().positive(),
  complexity: z.enum(['simple', 'complex']),
});
export type TaskEstimateOutput = z.infer<typeof TaskEstimateOutputSchema>;
