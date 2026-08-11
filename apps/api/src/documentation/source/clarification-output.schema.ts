import { z } from 'zod';
import { DOCUMENTATION_CATEGORY_KEYS } from '../documentation-categories';

const MaterialImpactSchema = z.enum([
  'timing',
  'scope',
  'behavior',
  'cost',
  'decision',
  'constraint',
]);

export const ClarificationCandidateSchema = z
  .object({
    conflictObservationId: z.uuid(),
    question: z.string().trim().min(1).max(2_000),
    impactRank: z.number().int().positive(),
    impactExplanation: z.string().trim().min(1).max(2_000),
    materialImpact: MaterialImpactSchema,
    evidenceObservationIds: z.array(z.uuid()).min(2),
    relatedInformationItemIds: z.array(z.uuid()),
    openPointContent: z.string().trim().min(1).max(10_000),
    categories: z.array(z.enum(DOCUMENTATION_CATEGORY_KEYS)).min(1),
  })
  .strict()
  .refine(
    ({ conflictObservationId, evidenceObservationIds }) =>
      evidenceObservationIds.includes(conflictObservationId),
    {
      path: ['evidenceObservationIds'],
      message: 'Conflict evidence must cite its triggering observation.',
    },
  );

export const ClarificationOutputSchema = z
  .object({
    clarifications: z.array(ClarificationCandidateSchema),
    clarificationCount: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine(({ clarifications, clarificationCount }, context) => {
    if (clarificationCount !== clarifications.length) {
      context.addIssue({
        code: 'custom',
        path: ['clarificationCount'],
        message: 'Clarification accounting must match output.',
      });
    }
    const seen = new Set<string>();
    for (const [index, clarification] of clarifications.entries()) {
      if (seen.has(clarification.conflictObservationId)) {
        context.addIssue({
          code: 'custom',
          path: ['clarifications', index, 'conflictObservationId'],
          message: 'A conflict can create only one clarification.',
        });
      }
      seen.add(clarification.conflictObservationId);
    }
  });

export type ClarificationCandidate = z.infer<
  typeof ClarificationCandidateSchema
>;

export const CLARIFICATION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'array',
  description:
    'Every material contradiction or ambiguity; never cap this array.',
  items: {
    type: 'object',
    additionalProperties: false,
    required: [
      'conflictObservationId',
      'question',
      'impactRank',
      'impactExplanation',
      'materialImpact',
      'evidenceObservationIds',
      'relatedInformationItemIds',
      'openPointContent',
      'categories',
    ],
    properties: {
      conflictObservationId: { type: 'string', format: 'uuid' },
      question: { type: 'string', minLength: 1 },
      impactRank: { type: 'integer', minimum: 1 },
      impactExplanation: { type: 'string', minLength: 1 },
      materialImpact: {
        enum: ['timing', 'scope', 'behavior', 'cost', 'decision', 'constraint'],
      },
      evidenceObservationIds: {
        type: 'array',
        minItems: 2,
        items: { type: 'string', format: 'uuid' },
      },
      relatedInformationItemIds: {
        type: 'array',
        items: { type: 'string', format: 'uuid' },
      },
      openPointContent: { type: 'string', minLength: 1 },
      categories: {
        type: 'array',
        minItems: 1,
        items: { enum: [...DOCUMENTATION_CATEGORY_KEYS] },
      },
    },
  },
};
