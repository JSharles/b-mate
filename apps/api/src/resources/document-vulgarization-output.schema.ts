import { z } from 'zod';

// Internal to this module only — never crosses the API boundary (see
// specs/011-project-resources data-model.md). Validates each locale's
// structured tool-use response before it is persisted as a
// ResourceVulgarization row.
export const DocumentVulgarizationOutputSchema = z.object({
  title: z.string(),
  content: z.string(),
});
export type DocumentVulgarizationOutput = z.infer<
  typeof DocumentVulgarizationOutputSchema
>;

// specs/013-ai-resource-categorization research.md Decision 1: parsed from
// the batch's third, locale-agnostic request — one category proposal can
// reuse an existing project key or mint a new one, key is never shown to a
// user (research.md Decision 2).
export const CategoryProposalSchema = z.object({
  key: z.string(),
  labelEn: z.string(),
  labelFr: z.string(),
});
export type CategoryProposal = z.infer<typeof CategoryProposalSchema>;

export const CategoryDetectionOutputSchema = z.object({
  categories: z.array(CategoryProposalSchema),
});
export type CategoryDetectionOutput = z.infer<
  typeof CategoryDetectionOutputSchema
>;
