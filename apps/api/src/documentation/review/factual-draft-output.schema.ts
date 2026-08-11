import { z } from 'zod';

export const FACTUAL_DRAFT_PROMPT_VERSION = 'factual-draft-v2';
export const FACTUAL_DRAFT_OUTPUT_CONTRACT = 'factual-draft-v1';

export const FactualDraftBlockSchema = z
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

export const FactualDraftOutputSchema = z
  .object({
    promptVersion: z.literal(FACTUAL_DRAFT_PROMPT_VERSION),
    inputFingerprint: z.string().regex(/^[0-9a-f]{64}$/u),
    categoryKey: z.enum(['overview', 'how_it_works', 'planning', 'other']),
    sourceRevisionId: z.uuid(),
    blocks: z.array(FactualDraftBlockSchema),
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
  .strict();

export const FACTUAL_DRAFT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'promptVersion',
    'inputFingerprint',
    'categoryKey',
    'sourceRevisionId',
    'blocks',
    'changeSummary',
    'provenanceSummary',
  ],
  properties: {
    promptVersion: { const: FACTUAL_DRAFT_PROMPT_VERSION },
    inputFingerprint: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    categoryKey: { enum: ['overview', 'how_it_works', 'planning', 'other'] },
    sourceRevisionId: { type: 'string', format: 'uuid' },
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

export function validateFactualCoverage(
  output: z.infer<typeof FactualDraftOutputSchema>,
  expectedIds: readonly string[],
): void {
  const covered = new Set(
    output.blocks.flatMap((block) => block.informationItemIds),
  );
  const expected = new Set(expectedIds);
  if (
    covered.size !== expected.size ||
    [...expected].some((id) => !covered.has(id)) ||
    [...covered].some((id) => !expected.has(id))
  ) {
    throw new Error('FACTUAL_DRAFT_INCOMPLETE_COVERAGE');
  }
}
