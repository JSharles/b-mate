import { z } from 'zod';
import { DOCUMENTATION_CATEGORY_KEYS } from '../documentation-categories';

export const DOCUMENT_EXTRACTION_PROMPT_VERSION = 'document-extraction-v1';

const CategoryKeySchema = z.enum(DOCUMENTATION_CATEGORY_KEYS);
const ObservationKindSchema = z.enum([
  'fact',
  'decision',
  'date',
  'figure',
  'constraint',
  'explanation',
  'open_point',
]);

export const ExtractionSourceLocatorSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('pdf_page'),
      page: z.number().int().positive(),
      excerpt: z.string().trim().min(1).max(2_000),
    })
    .strict(),
  z
    .object({
      type: z.literal('docx_heading'),
      heading: z.string().trim().min(1).max(500),
      paragraph: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal('image_region'),
      x: z.number().nonnegative(),
      y: z.number().nonnegative(),
      width: z.number().positive(),
      height: z.number().positive(),
    })
    .strict(),
  z
    .object({
      type: z.literal('notion_block'),
      blockId: z.string().trim().min(1).max(255),
      position: z.number().int().nonnegative(),
    })
    .strict(),
]);

export const ExtractedObservationSchema = z
  .object({
    sequence: z.number().int().nonnegative(),
    kind: ObservationKindSchema,
    originalExcerpt: z.string().trim().min(1).max(4_000),
    normalizedContent: z.string().trim().min(1).max(20_000),
    normalizedLanguage: z.string().trim().min(2).max(35),
    categories: z.array(CategoryKeySchema).min(1),
    locator: ExtractionSourceLocatorSchema,
  })
  .strict();

export const ExtractionOutputSchema = z
  .object({
    promptVersion: z.literal(DOCUMENT_EXTRACTION_PROMPT_VERSION),
    inputFingerprint: z.string().regex(/^[0-9a-f]{64}$/u),
    inputChunkCount: z.number().int().nonnegative(),
    observations: z.array(ExtractedObservationSchema),
    accounting: z
      .object({
        outputObservationCount: z.number().int().nonnegative(),
        rejectedClaimCount: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()
  .superRefine(({ accounting, observations }, context) => {
    if (accounting.outputObservationCount !== observations.length) {
      context.addIssue({
        code: 'custom',
        message: 'Output accounting must match the observation count.',
        path: ['accounting', 'outputObservationCount'],
      });
    }
    const sequences = new Set<number>();
    for (const [index, observation] of observations.entries()) {
      if (sequences.has(observation.sequence)) {
        context.addIssue({
          code: 'custom',
          message: 'Observation sequence numbers must be unique.',
          path: ['observations', index, 'sequence'],
        });
      }
      sequences.add(observation.sequence);
    }
  });

export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;

export const DOCUMENT_EXTRACTION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'promptVersion',
    'inputFingerprint',
    'inputChunkCount',
    'observations',
    'accounting',
  ],
  properties: {
    promptVersion: { const: DOCUMENT_EXTRACTION_PROMPT_VERSION },
    inputFingerprint: { type: 'string', pattern: '^[0-9a-f]{64}$' },
    inputChunkCount: { type: 'integer', minimum: 0 },
    observations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'sequence',
          'kind',
          'originalExcerpt',
          'normalizedContent',
          'normalizedLanguage',
          'categories',
          'locator',
        ],
        properties: {
          sequence: { type: 'integer', minimum: 0 },
          kind: {
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
          originalExcerpt: { type: 'string', minLength: 1 },
          normalizedContent: { type: 'string', minLength: 1 },
          normalizedLanguage: { type: 'string', minLength: 2 },
          categories: {
            type: 'array',
            minItems: 1,
            items: { enum: [...DOCUMENTATION_CATEGORY_KEYS] },
          },
          locator: {
            oneOf: [
              {
                type: 'object',
                additionalProperties: false,
                required: ['type', 'page', 'excerpt'],
                properties: {
                  type: { const: 'pdf_page' },
                  page: { type: 'integer', minimum: 1 },
                  excerpt: { type: 'string', minLength: 1 },
                },
              },
              {
                type: 'object',
                additionalProperties: false,
                required: ['type', 'heading', 'paragraph'],
                properties: {
                  type: { const: 'docx_heading' },
                  heading: { type: 'string', minLength: 1 },
                  paragraph: { type: 'integer', minimum: 0 },
                },
              },
              {
                type: 'object',
                additionalProperties: false,
                required: ['type', 'x', 'y', 'width', 'height'],
                properties: {
                  type: { const: 'image_region' },
                  x: { type: 'number', minimum: 0 },
                  y: { type: 'number', minimum: 0 },
                  width: { type: 'number', exclusiveMinimum: 0 },
                  height: { type: 'number', exclusiveMinimum: 0 },
                },
              },
              {
                type: 'object',
                additionalProperties: false,
                required: ['type', 'blockId', 'position'],
                properties: {
                  type: { const: 'notion_block' },
                  blockId: { type: 'string', minLength: 1 },
                  position: { type: 'integer', minimum: 0 },
                },
              },
            ],
          },
        },
      },
    },
    accounting: {
      type: 'object',
      additionalProperties: false,
      required: ['outputObservationCount', 'rejectedClaimCount'],
      properties: {
        outputObservationCount: { type: 'integer', minimum: 0 },
        rejectedClaimCount: { type: 'integer', minimum: 0 },
      },
    },
  },
};

export function parseExtractionOutput(value: unknown): ExtractionOutput {
  return ExtractionOutputSchema.parse(value);
}
