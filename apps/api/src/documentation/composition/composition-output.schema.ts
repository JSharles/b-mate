import { z } from 'zod';

export const SECTION_COMPOSITION_PROMPT_VERSION = 'section-composition-v2';
export const SECTION_COMPOSITION_OUTPUT_CONTRACT = 'section-composition-v2';

// A section is a view of the reference document, so its blocks are shaped like
// the document's: prose, and what the document leaves open carried as its own
// kind rather than smoothed into a sentence that reads as settled.
export const CompositionBlockSchema = z
  .object({
    kind: z.enum(['paragraph', 'open_point']),
    text: z.string().trim().min(1).max(20_000),
  })
  .strict();

// FR-010: what could not be resolved travels beside the content, never inside
// it. The model supplies the question and why it matters to what the client
// will end up reading.
export const CompositionQuestionSchema = z
  .object({
    question: z.string().trim().min(1).max(2_000),
    impactExplanation: z.string().trim().min(1).max(2_000),
  })
  .strict();

// Nothing here asks the model to echo an identifier back. A result arrives on
// the attempt it was submitted for, and `applySuccessfulResult` refuses an
// attempt that is no longer current — which is the check that was actually
// doing the work while the echoed ids were killing stages by getting a
// character wrong (see 45a13ac, 44062a0).
export const SectionCompositionOutputSchema = z
  .object({
    promptVersion: z.literal(SECTION_COMPOSITION_PROMPT_VERSION),
    outcome: z.enum(['composed', 'nothing_matched']),
    blocks: z.array(CompositionBlockSchema),
    questions: z.array(CompositionQuestionSchema),
    changeSummary: z.string().trim().min(1).max(2_000),
  })
  .strict()
  .superRefine((output, context) => {
    // FR-011 has to hold in both directions, or "nothing matched" becomes a
    // label the model can attach to content it did produce.
    if (output.outcome === 'nothing_matched' && output.blocks.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: 'A composition that matched nothing cannot carry blocks.',
      });
    }
    if (output.outcome === 'composed' && output.blocks.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['outcome'],
        message: 'A composition with no blocks must report nothing_matched.',
      });
    }
  });

export const SECTION_COMPOSITION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'promptVersion',
    'outcome',
    'blocks',
    'questions',
    'changeSummary',
  ],
  properties: {
    promptVersion: { const: SECTION_COMPOSITION_PROMPT_VERSION },
    outcome: { enum: ['composed', 'nothing_matched'] },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'text'],
        properties: {
          kind: { enum: ['paragraph', 'open_point'] },
          text: { type: 'string' },
        },
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'impactExplanation'],
        properties: {
          question: { type: 'string' },
          impactExplanation: { type: 'string' },
        },
      },
    },
    changeSummary: { type: 'string' },
  },
};
