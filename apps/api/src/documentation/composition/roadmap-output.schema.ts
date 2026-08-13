import { z } from 'zod';

export const ROADMAP_COMPOSITION_PROMPT_VERSION = 'roadmap-composition-v1';
export const ROADMAP_COMPOSITION_OUTPUT_CONTRACT = 'roadmap-composition-v1';

// A milestone as the model returns it: when, what, and optionally why it
// matters. No id — ids are minted server-side and never asked of the model,
// which is the rule 45a13ac established after echoed identifiers killed three
// stages by getting a character wrong.
export const RoadmapMilestoneOutputSchema = z
  .object({
    when: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2_000).nullable(),
  })
  .strict();

export const RoadmapCompositionOutputSchema = z
  .object({
    promptVersion: z.literal(ROADMAP_COMPOSITION_PROMPT_VERSION),
    outcome: z.enum(['composed', 'nothing_matched']),
    milestones: z.array(RoadmapMilestoneOutputSchema),
    changeSummary: z.string().trim().min(1).max(2_000),
  })
  .strict()
  .superRefine((output, context) => {
    // A roadmap is the shape a model most wants to invent, so "nothing matched"
    // has to hold in both directions or it becomes a label attached to content
    // it did produce anyway.
    if (output.outcome === 'nothing_matched' && output.milestones.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['milestones'],
        message: 'A composition that matched nothing cannot carry milestones.',
      });
    }
    if (output.outcome === 'composed' && output.milestones.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['outcome'],
        message:
          'A composition with no milestones must report nothing_matched.',
      });
    }
  });

export const ROADMAP_COMPOSITION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['promptVersion', 'outcome', 'milestones', 'changeSummary'],
  properties: {
    promptVersion: { const: ROADMAP_COMPOSITION_PROMPT_VERSION },
    outcome: { enum: ['composed', 'nothing_matched'] },
    milestones: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['when', 'title', 'description'],
        properties: {
          when: { type: 'string' },
          title: { type: 'string' },
          description: { type: ['string', 'null'] },
        },
      },
    },
    changeSummary: { type: 'string' },
  },
};
