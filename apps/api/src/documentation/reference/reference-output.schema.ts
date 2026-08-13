import { z } from 'zod';
import {
  ITEM_REF_JSON_SCHEMA,
  ItemRefSchema,
  resolveRef,
} from '../source/reference-token';

export const REFERENCE_DOCUMENT_PROMPT_VERSION = 'reference-document-v1';
export const REFERENCE_DOCUMENT_OUTPUT_CONTRACT = 'reference-document-v1';

export const ReferenceBlockOutputSchema = z
  .object({
    kind: z.enum(['paragraph', 'open_point']),
    text: z.string().trim().min(1).max(20_000),
    // Short references, never identifiers. Asked for UUIDs, the model returned
    // a hundred passages and mistyped one character of one of them — and lost
    // the whole document. The project had already learned this once; see
    // reference-token.ts.
    informationItemRefs: z.array(ItemRefSchema).min(1),
  })
  .strict();

export const ReferencePartOutputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    blocks: z.array(ReferenceBlockOutputSchema).min(1),
  })
  .strict();

// Nothing here asks the model to echo an identifier back. A result arrives on
// the attempt it was submitted for, and `applySuccessfulResult` refuses an
// attempt that is no longer current — the check that was doing the real work
// while echoed ids were killing stages over one wrong character.
export const ReferenceDocumentOutputSchema = z
  .object({
    promptVersion: z.literal(REFERENCE_DOCUMENT_PROMPT_VERSION),
    outcome: z.enum(['written', 'nothing_usable']),
    parts: z.array(ReferencePartOutputSchema),
  })
  .strict()
  .superRefine((output, context) => {
    // FR-007 has to hold both ways, or "nothing usable" becomes a label the
    // model can attach to a document it did write.
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
  });

export const REFERENCE_DOCUMENT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['promptVersion', 'outcome', 'parts'],
  properties: {
    promptVersion: { const: REFERENCE_DOCUMENT_PROMPT_VERSION },
    outcome: { enum: ['written', 'nothing_usable'] },
    parts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'blocks'],
        properties: {
          title: { type: 'string' },
          blocks: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['kind', 'text', 'informationItemRefs'],
              properties: {
                kind: { enum: ['paragraph', 'open_point'] },
                text: { type: 'string' },
                informationItemRefs: {
                  type: 'array',
                  minItems: 1,
                  items: ITEM_REF_JSON_SCHEMA,
                },
              },
            },
          },
        },
      },
    },
  },
};

export interface ResolvedReferencePart {
  title: string;
  blocks: {
    kind: 'paragraph' | 'open_point';
    text: string;
    informationItemIds: string[];
  }[];
}

// The document may leave statements out — a reference is a reading, not a
// transcript. What must hold is the other direction: every citation names
// something we actually sent. A reference we never issued is invented
// provenance, and it is refused rather than stored.
export function resolveReferenceCitations(
  output: z.infer<typeof ReferenceDocumentOutputSchema>,
  refToItemId: ReadonlyMap<string, string>,
): ResolvedReferencePart[] {
  return output.parts.map((part) => ({
    title: part.title,
    blocks: part.blocks.map((block) => ({
      kind: block.kind,
      text: block.text,
      informationItemIds: block.informationItemRefs.map((ref) =>
        resolveRef(refToItemId, ref, 'statement'),
      ),
    })),
  }));
}
