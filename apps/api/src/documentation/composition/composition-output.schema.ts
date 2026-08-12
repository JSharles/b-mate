import { z } from 'zod';

export const SECTION_COMPOSITION_PROMPT_VERSION = 'section-composition-v1';
export const SECTION_COMPOSITION_OUTPUT_CONTRACT = 'section-composition-v1';

export const CompositionBlockSchema = z
  .object({
    type: z.enum([
      'fact',
      'decision',
      'date',
      'figure',
      'constraint',
      'explanation',
      'open_point',
    ]),
    text: z.string().trim().min(1).max(20_000),
    informationItemIds: z.array(z.uuid()).min(1),
    openPointId: z.uuid().nullable().optional(),
  })
  .strict()
  .superRefine((block, context) => {
    if (block.type === 'open_point' && !block.openPointId) {
      context.addIssue({
        code: 'custom',
        path: ['openPointId'],
        message: 'Open points require a stable id.',
      });
    }
  });

// FR-010: what could not be resolved travels beside the content, never inside
// it. The model supplies the question and why it matters; the identifiers it
// cites are checked against what we sent, never trusted.
export const CompositionQuestionSchema = z
  .object({
    question: z.string().trim().min(1).max(2_000),
    impactExplanation: z.string().trim().min(1).max(2_000),
    informationItemIds: z.array(z.uuid()),
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
    provenanceSummary: z.array(
      z
        .object({
          label: z.string().trim().min(1),
          itemCount: z.number().int().positive(),
        })
        .strict(),
    ),
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
    'provenanceSummary',
  ],
  properties: {
    promptVersion: { const: SECTION_COMPOSITION_PROMPT_VERSION },
    outcome: { enum: ['composed', 'nothing_matched'] },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'text', 'informationItemIds'],
        properties: {
          type: {
            enum: [
              'fact',
              'decision',
              'date',
              'figure',
              'constraint',
              'explanation',
              'open_point',
            ],
          },
          text: { type: 'string' },
          informationItemIds: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', format: 'uuid' },
          },
          openPointId: { type: ['string', 'null'], format: 'uuid' },
        },
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'impactExplanation', 'informationItemIds'],
        properties: {
          question: { type: 'string' },
          impactExplanation: { type: 'string' },
          informationItemIds: {
            type: 'array',
            items: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    changeSummary: { type: 'string' },
    provenanceSummary: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'itemCount'],
        properties: {
          label: { type: 'string' },
          itemCount: { type: 'integer', minimum: 1 },
        },
      },
    },
  },
};

// A section is a selection, so there is no coverage rule to enforce: leaving a
// statement out is the whole point. What must hold is the other direction —
// every citation names something we actually sent. An invented id is invented
// provenance, and provenance is the one thing this product cannot fake.
export function validateCompositionReferences(
  output: z.infer<typeof SectionCompositionOutputSchema>,
  allowedIds: readonly string[],
): void {
  const allowed = new Set(allowedIds);
  const cited = [
    ...output.blocks.flatMap((block) => block.informationItemIds),
    ...output.blocks.flatMap((block) =>
      block.openPointId ? [block.openPointId] : [],
    ),
    ...output.questions.flatMap((question) => question.informationItemIds),
  ];
  if (cited.some((id) => !allowed.has(id))) {
    throw new Error('SECTION_COMPOSITION_UNKNOWN_REFERENCE');
  }
}
