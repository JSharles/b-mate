import { z } from 'zod';

export const REFERENCE_DOCUMENT_PROMPT_VERSION = 'reference-document-v3';
export const REFERENCE_DOCUMENT_OUTPUT_CONTRACT = 'reference-document-v3';

// The model never sees an identifier, only `d0` and `p0`. Handing a model raw
// UUIDs and asking for them back verbatim cost this codebase a whole stage:
// 60 of 61 came back perfectly and the 61st had one character wrong
// — `…79f40f44ef70` as `…79f44f44ef70` — which failed the run, twice, and left
// the document integrating forever. Copying 36 random characters is not a task
// worth asking of a language model, and the odds fall as documents accumulate.
// A slip on `d3` lands on a ref that either does not exist or is obviously the
// wrong kind, and is refused loudly.
export const DocumentRefSchema = z.string().regex(/^d\d{1,4}$/u);
export const PointRefSchema = z.string().regex(/^p\d{1,4}$/u);

const DOCUMENT_REF_JSON_SCHEMA = { type: 'string', pattern: '^d[0-9]{1,4}$' };
const POINT_REF_JSON_SCHEMA = { type: 'string', pattern: '^p[0-9]{1,4}$' };

export const ReferenceBlockOutputSchema = z
  .object({
    kind: z.enum(['paragraph', 'gap']),
    text: z.string().trim().min(1).max(20_000),
    // Set on a gap: the point it stands for, so it can be answered in place.
    pointRef: PointRefSchema.nullable().optional(),
  })
  .strict()
  .superRefine((block, context) => {
    if (block.kind === 'gap' && !block.pointRef) {
      context.addIssue({
        code: 'custom',
        path: ['pointRef'],
        message: 'A gap must name the point it stands for.',
      });
    }
  });

export const ReferencePartOutputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    blocks: z.array(ReferenceBlockOutputSchema).min(1),
    documentRefs: z.array(DocumentRefSchema).min(1),
  })
  .strict();

export const ReferencePointOutputSchema = z
  .object({
    ref: PointRefSchema,
    question: z.string().trim().min(1).max(2_000),
    why: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const ReferenceDocumentOutputSchema = z
  .object({
    promptVersion: z.literal(REFERENCE_DOCUMENT_PROMPT_VERSION),
    outcome: z.enum(['written', 'nothing_usable']),
    parts: z.array(ReferencePartOutputSchema),
    points: z.array(ReferencePointOutputSchema),
    // FR-017: a document that does not belong is named rather than woven in.
    unrelatedDocumentRefs: z.array(DocumentRefSchema),
  })
  .strict()
  .superRefine((output, context) => {
    if (output.outcome === 'nothing_usable' && output.parts.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['parts'],
        message: 'A document that found nothing usable cannot carry parts.',
      });
    }
    if (output.outcome === 'written' && output.parts.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['outcome'],
        message: 'A document with no parts must report nothing_usable.',
      });
    }
    // A gap pointing at a point that was not raised would render as a question
    // with no question in it.
    const raised = new Set(output.points.map((point) => point.ref));
    for (const part of output.parts) {
      for (const block of part.blocks) {
        if (block.pointRef && !raised.has(block.pointRef)) {
          context.addIssue({
            code: 'custom',
            path: ['parts'],
            message: `Gap names point ${block.pointRef}, which was not raised.`,
          });
        }
      }
    }
  });

export const REFERENCE_DOCUMENT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'promptVersion',
    'outcome',
    'parts',
    'points',
    'unrelatedDocumentRefs',
  ],
  properties: {
    promptVersion: { const: REFERENCE_DOCUMENT_PROMPT_VERSION },
    outcome: { enum: ['written', 'nothing_usable'] },
    parts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'blocks', 'documentRefs'],
        properties: {
          title: { type: 'string' },
          documentRefs: {
            type: 'array',
            minItems: 1,
            items: DOCUMENT_REF_JSON_SCHEMA,
          },
          blocks: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['kind', 'text'],
              properties: {
                kind: { enum: ['paragraph', 'gap'] },
                text: { type: 'string' },
                pointRef: POINT_REF_JSON_SCHEMA,
              },
            },
          },
        },
      },
    },
    points: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'question', 'why'],
        properties: {
          ref: POINT_REF_JSON_SCHEMA,
          question: { type: 'string' },
          why: { type: 'string' },
        },
      },
    },
    unrelatedDocumentRefs: {
      type: 'array',
      items: DOCUMENT_REF_JSON_SCHEMA,
    },
  },
};

export interface ResolvedReference {
  parts: {
    title: string;
    documentTitles: string[];
    blocks: {
      kind: 'paragraph' | 'gap';
      text: string;
      pointId: string | null;
    }[];
  }[];
  points: { id: string; question: string; why: string }[];
  unrelatedDocumentTitles: string[];
}

// Turns the refs the model answered with back into what they stand for,
// refusing any it was never given. A ref we never issued is invented
// provenance, and it is refused rather than stored.
export function resolveReference(
  output: z.infer<typeof ReferenceDocumentOutputSchema>,
  refToDocumentTitle: ReadonlyMap<string, string>,
): ResolvedReference {
  const title = (ref: string): string => {
    const resolved = refToDocumentTitle.get(ref);
    if (!resolved) {
      throw new Error(`REFERENCE_DOCUMENT_UNKNOWN_DOCUMENT_${ref}`);
    }
    return resolved;
  };

  return {
    parts: output.parts.map((part) => ({
      title: part.title,
      documentTitles: part.documentRefs.map(title),
      blocks: part.blocks.map((block) => ({
        kind: block.kind,
        text: block.text,
        pointId: block.pointRef ?? null,
      })),
    })),
    points: output.points.map((point) => ({
      id: point.ref,
      question: point.question,
      why: point.why,
    })),
    unrelatedDocumentTitles: output.unrelatedDocumentRefs.map(title),
  };
}
