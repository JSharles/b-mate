import {
  REFERENCE_DOCUMENT_JSON_SCHEMA,
  REFERENCE_DOCUMENT_PROMPT_VERSION,
  ReferenceDocumentOutputSchema,
  resolveReferenceCitations,
} from './reference-output.schema';

const itemA = '123e4567-e89b-42d3-a456-426614174000';
const refs = new Map([['i0', itemA]]);

function output(overrides: Record<string, unknown> = {}) {
  return {
    promptVersion: REFERENCE_DOCUMENT_PROMPT_VERSION,
    outcome: 'written',
    parts: [
      {
        title: 'Le projet',
        blocks: [
          {
            kind: 'paragraph',
            text: 'Le lancement est prévu en octobre.',
            informationItemRefs: ['i0'],
          },
        ],
      },
    ],
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

  it('refuses a part with no passage — a heading over nothing says nothing', () => {
    expect(
      ReferenceDocumentOutputSchema.safeParse(
        output({ parts: [{ title: 'Le projet', blocks: [] }] }),
      ).success,
    ).toBe(false);
  });

  it('refuses a passage resting on nothing', () => {
    expect(
      ReferenceDocumentOutputSchema.safeParse(
        output({
          parts: [
            {
              title: 'Le projet',
              blocks: [
                {
                  kind: 'paragraph',
                  text: 'Sans source.',
                  informationItemRefs: [],
                },
              ],
            },
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it('keeps a gap as its own kind of passage', () => {
    const parsed = ReferenceDocumentOutputSchema.parse(
      output({
        parts: [
          {
            title: 'Planning',
            blocks: [
              {
                kind: 'open_point',
                text: "La date de lancement n'est pas confirmée.",
                informationItemRefs: ['i0'],
              },
            ],
          },
        ],
      }),
    );

    expect(parsed.parts[0].blocks[0].kind).toBe('open_point');
  });

  it('refuses an output from a different prompt version', () => {
    expect(
      ReferenceDocumentOutputSchema.safeParse(
        output({ promptVersion: 'reference-document-v0' }),
      ).success,
    ).toBe(false);
  });

  it('refuses an echoed identifier smuggled in as an extra field', () => {
    expect(
      ReferenceDocumentOutputSchema.safeParse(output({ documentId: itemA }))
        .success,
    ).toBe(false);
  });
});

describe('resolving what the document cited', () => {
  it('turns the references back into the statements they stand for', () => {
    const parsed = ReferenceDocumentOutputSchema.parse(output());

    expect(
      resolveReferenceCitations(parsed, refs)[0].blocks[0].informationItemIds,
    ).toEqual([itemA]);
  });

  // Invented provenance is the one thing this product cannot afford, so it is
  // refused in code rather than discouraged in the prompt.
  it('refuses a citation naming a statement we never sent', () => {
    const parsed = ReferenceDocumentOutputSchema.parse(
      output({
        parts: [
          {
            title: 'Le projet',
            blocks: [
              {
                kind: 'paragraph',
                text: 'Provenance inventée.',
                informationItemRefs: ['i9'],
              },
            ],
          },
        ],
      }),
    );

    expect(() => resolveReferenceCitations(parsed, refs)).toThrow(
      'unknown statement i9',
    );
  });

  // The model never sees an identifier, so it cannot mistype one. It was asked
  // for UUIDs first, returned a hundred passages, mistyped one character of one
  // of them, and lost the whole document.
  it('refuses anything that is not a reference we issue', () => {
    expect(
      ReferenceDocumentOutputSchema.safeParse(
        output({
          parts: [
            {
              title: 'Le projet',
              blocks: [
                {
                  kind: 'paragraph',
                  text: 'Un identifiant recopié.',
                  informationItemRefs: [itemA],
                },
              ],
            },
          ],
        }),
      ).success,
    ).toBe(false);
  });

  // The provider is handed the JSON schema, not the Zod one. They drifted
  // apart once — the model was asked for a field the parser then rejected, and
  // every write failed on output it had produced exactly as instructed.
  it('asks the provider for the same field the parser accepts', () => {
    const block = (
      (
        (REFERENCE_DOCUMENT_JSON_SCHEMA.properties as Record<string, any>).parts
          .items.properties.blocks as Record<string, any>
      ).items as Record<string, any>
    );

    expect(block.required).toContain('informationItemRefs');
    expect(Object.keys(block.properties)).toContain('informationItemRefs');
    expect(Object.keys(block.properties)).not.toContain('informationItemIds');
  });
});
