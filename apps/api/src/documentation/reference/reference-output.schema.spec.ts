import {
  REFERENCE_DOCUMENT_PROMPT_VERSION,
  ReferenceDocumentOutputSchema,
  validateReferenceCitations,
} from './reference-output.schema';

const itemA = '123e4567-e89b-42d3-a456-426614174000';
const unknown = '123e4567-e89b-42d3-a456-4266141740ff';

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
            informationItemIds: [itemA],
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
                  informationItemIds: [],
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
                informationItemIds: [itemA],
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

describe('validating what the document cited', () => {
  it('accepts a reading that leaves statements out', () => {
    const parsed = ReferenceDocumentOutputSchema.parse(output());

    expect(() =>
      validateReferenceCitations(parsed, [itemA, unknown]),
    ).not.toThrow();
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
                informationItemIds: [unknown],
              },
            ],
          },
        ],
      }),
    );

    expect(() => validateReferenceCitations(parsed, [itemA])).toThrow(
      'REFERENCE_DOCUMENT_UNKNOWN_CITATION',
    );
  });
});
