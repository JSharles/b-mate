import { z } from 'zod';
import { DOCUMENTATION_CATEGORY_KEYS } from '../documentation-categories';
import {
  ITEM_REF_JSON_SCHEMA,
  ItemRefSchema,
  OBSERVATION_REF_JSON_SCHEMA,
  ObservationRefSchema,
} from './reference-token';

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
    conflictObservationRef: ObservationRefSchema,
    question: z.string().trim().min(1).max(2_000),
    impactRank: z.number().int().positive(),
    impactExplanation: z.string().trim().min(1).max(2_000),
    materialImpact: MaterialImpactSchema,
    evidenceObservationRefs: z.array(ObservationRefSchema).min(2),
    relatedItemRefs: z.array(ItemRefSchema),
    openPointContent: z.string().trim().min(1).max(10_000),
    categories: z.array(z.enum(DOCUMENTATION_CATEGORY_KEYS)).min(1),
  })
  .strict()
  .refine(
    ({ conflictObservationRef, evidenceObservationRefs }) =>
      evidenceObservationRefs.includes(conflictObservationRef),
    {
      path: ['evidenceObservationRefs'],
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
      if (seen.has(clarification.conflictObservationRef)) {
        context.addIssue({
          code: 'custom',
          path: ['clarifications', index, 'conflictObservationRef'],
          message: 'A conflict can create only one clarification.',
        });
      }
      seen.add(clarification.conflictObservationRef);
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
      'conflictObservationRef',
      'question',
      'impactRank',
      'impactExplanation',
      'materialImpact',
      'evidenceObservationRefs',
      'relatedItemRefs',
      'openPointContent',
      'categories',
    ],
    properties: {
      conflictObservationRef: OBSERVATION_REF_JSON_SCHEMA,
      question: { type: 'string', minLength: 1 },
      impactRank: { type: 'integer', minimum: 1 },
      impactExplanation: { type: 'string', minLength: 1 },
      materialImpact: {
        enum: ['timing', 'scope', 'behavior', 'cost', 'decision', 'constraint'],
      },
      evidenceObservationRefs: {
        type: 'array',
        minItems: 2,
        items: OBSERVATION_REF_JSON_SCHEMA,
      },
      relatedItemRefs: {
        type: 'array',
        items: ITEM_REF_JSON_SCHEMA,
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
