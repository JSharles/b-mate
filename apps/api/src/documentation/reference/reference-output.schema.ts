import { z } from 'zod';

export const REFERENCE_DOCUMENT_PROMPT_VERSION = 'reference-document-v1';
export const REFERENCE_DOCUMENT_OUTPUT_CONTRACT = 'reference-document-v1';

export const ReferenceBlockOutputSchema = z
  .object({
    kind: z.enum(['paragraph', 'open_point']),
    text: z.string().trim().min(1).max(20_000),
    // Every passage names what it rests on, and the ids are checked against
    // what was sent. This is what makes "no invention" a property of the code
    // rather than a hope placed in the prompt.
    informationItemIds: z.array(z.uuid()).min(1),
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
              required: ['kind', 'text', 'informationItemIds'],
              properties: {
                kind: { enum: ['paragraph', 'open_point'] },
                text: { type: 'string' },
                informationItemIds: {
                  type: 'array',
                  minItems: 1,
                  items: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
      },
    },
  },
};

// The document may leave statements out — a reference is a reading, not a
// transcript. What must hold is the other direction: every citation names
// something we actually sent. An invented id is invented provenance.
export function validateReferenceCitations(
  output: z.infer<typeof ReferenceDocumentOutputSchema>,
  allowedIds: readonly string[],
): void {
  const allowed = new Set(allowedIds);
  const cited = output.parts.flatMap((part) =>
    part.blocks.flatMap((block) => block.informationItemIds),
  );
  if (cited.some((id) => !allowed.has(id))) {
    throw new Error('REFERENCE_DOCUMENT_UNKNOWN_CITATION');
  }
}
