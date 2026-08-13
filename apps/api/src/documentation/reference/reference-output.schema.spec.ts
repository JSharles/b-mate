import {
  REFERENCE_DOCUMENT_PROMPT_VERSION,
  ReferenceDocumentOutputSchema,
  resolveReference,
} from './reference-output.schema';

const refs = new Map([
  ['d0', 'Cahier des charges'],
  ['d1', 'Pitch marketing'],
]);

function output(overrides: Record<string, unknown> = {}) {
  return {
    promptVersion: REFERENCE_DOCUMENT_PROMPT_VERSION,
    outcome: 'written',
    parts: [
      {
        title: 'Le projet',
        documentRefs: ['d0'],
        blocks: [
          { kind: 'paragraph', text: 'Le produit rend un projet lisible.' },
        ],
      },
    ],
    points: [],
    unrelatedDocumentRefs: [],
    ...overrides,
  };
}

describe('reference document output', () => {
  it('accepts a written document', () => {
    expect(ReferenceDocumentOutputSchema.parse(output()).outcome).toBe(
      'written',
    );
  });

  it('accepts a document that found nothing usable', () => {
    expect(
      ReferenceDocumentOutputSchema.parse(
        output({ outcome: 'nothing_usable', parts: [] }),
      ).parts,
    ).toEqual([]);
  });

  it('refuses "nothing usable" attached to a document that was written', () => {
    expect(
      ReferenceDocumentOutputSchema.safeParse(
        output({ outcome: 'nothing_usable' }),
      ).success,
    ).toBe(false);
  });

  it('refuses an empty document claiming to have been written', () => {
    expect(
      ReferenceDocumentOutputSchema.safeParse(output({ parts: [] })).success,
    ).toBe(false);
  });

  // FR-004: a part says what it drew on. Coarser than per-sentence provenance,
  // and the only claim left that can be checked.
  it('refuses a part that names no document', () => {
    expect(
      ReferenceDocumentOutputSchema.safeParse(
        output({
          parts: [
            {
              title: 'Le projet',
              documentRefs: [],
              blocks: [{ kind: 'paragraph', text: 'Sans source.' }],
            },
          ],
        }),
      ).success,
    ).toBe(false);
  });

  // FR-016: a hole is visible where it applies, and it names the question it
  // stands for — otherwise it is a blank the reader has to interpret.
  it('refuses a gap that names no point', () => {
    expect(
      ReferenceDocumentOutputSchema.safeParse(
        output({
          parts: [
            {
              title: 'Planning',
              documentRefs: ['d0'],
              blocks: [{ kind: 'gap', text: 'Date non confirmée.' }],
            },
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it('refuses a gap naming a point that was never raised', () => {
    expect(
      ReferenceDocumentOutputSchema.safeParse(
        output({
          parts: [
            {
              title: 'Planning',
              documentRefs: ['d0'],
              blocks: [
                { kind: 'gap', text: 'Date non confirmée.', pointRef: 'p3' },
              ],
            },
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it('accepts a gap tied to a point it raised', () => {
    const parsed = ReferenceDocumentOutputSchema.parse(
      output({
        parts: [
          {
            title: 'Planning',
            documentRefs: ['d0'],
            blocks: [
              { kind: 'gap', text: 'Date non confirmée.', pointRef: 'p0' },
            ],
          },
        ],
        points: [
          { ref: 'p0', question: 'Quelle date ?', why: 'Le client la lira.' },
        ],
      }),
    );

    expect(parsed.points).toHaveLength(1);
  });

  // The model never sees an identifier, only `d0`. It was handed UUIDs once and
  // lost a whole document to one mistyped character.
  it('refuses anything that is not a reference we issue', () => {
    expect(
      ReferenceDocumentOutputSchema.safeParse(
        output({
          parts: [
            {
              title: 'Le projet',
              documentRefs: ['123e4567-e89b-42d3-a456-426614174000'],
              blocks: [{ kind: 'paragraph', text: 'Un identifiant recopié.' }],
            },
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it('refuses an output from a different prompt version', () => {
    expect(
      ReferenceDocumentOutputSchema.safeParse(
        output({ promptVersion: 'reference-document-v1' }),
      ).success,
    ).toBe(false);
  });
});

describe('resolving what the document drew on', () => {
  it('names the documents behind each part', () => {
    const parsed = ReferenceDocumentOutputSchema.parse(output());

    expect(resolveReference(parsed, refs).parts[0].documentTitles).toEqual([
      'Cahier des charges',
    ]);
  });

  it('refuses a document reference we never issued', () => {
    const parsed = ReferenceDocumentOutputSchema.parse(
      output({
        parts: [
          {
            title: 'Le projet',
            documentRefs: ['d9'],
            blocks: [{ kind: 'paragraph', text: 'Provenance inventée.' }],
          },
        ],
      }),
    );

    expect(() => resolveReference(parsed, refs)).toThrow(
      'REFERENCE_DOCUMENT_UNKNOWN_DOCUMENT_d9',
    );
  });

  // FR-017: a file added by mistake is named, not woven in.
  it('names a document that does not belong', () => {
    const parsed = ReferenceDocumentOutputSchema.parse(
      output({ unrelatedDocumentRefs: ['d1'] }),
    );

    expect(resolveReference(parsed, refs).unrelatedDocumentTitles).toEqual([
      'Pitch marketing',
    ]);
  });
});
