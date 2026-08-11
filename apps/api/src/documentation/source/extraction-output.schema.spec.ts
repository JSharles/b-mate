import {
  ExtractionOutputSchema,
  parseExtractionOutput,
} from './extraction-output.schema';

const baseObservation = {
  sequence: 0,
  kind: 'fact',
  originalExcerpt: 'Le lancement est prévu le 4 avril.',
  normalizedContent: 'Le lancement est prévu le 4 avril.',
  normalizedLanguage: 'fr',
  categories: ['planning'],
};

describe('ExtractionOutputSchema', () => {
  it.each([
    {
      type: 'pdf_page',
      page: 2,
      excerpt: 'Le lancement est prévu le 4 avril.',
    },
    { type: 'docx_heading', heading: 'Calendrier', paragraph: 3 },
    { type: 'image_region', x: 80, y: 120, width: 880, height: 160 },
    { type: 'notion_block', blockId: 'block-1', position: 4 },
  ])('accepts attributable $type observations', (locator) => {
    const output = parseExtractionOutput({
      promptVersion: 'document-extraction-v1',
      inputFingerprint: 'a'.repeat(64),
      inputChunkCount: 1,
      observations: [{ ...baseObservation, locator }],
      accounting: { outputObservationCount: 1, rejectedClaimCount: 0 },
    });

    expect(output.observations[0].locator).toEqual(locator);
  });

  it('rejects accounting that does not match the observations', () => {
    const parsed = ExtractionOutputSchema.safeParse({
      promptVersion: 'document-extraction-v1',
      inputFingerprint: 'b'.repeat(64),
      inputChunkCount: 2,
      observations: [
        {
          ...baseObservation,
          locator: { type: 'docx_heading', heading: 'But', paragraph: 0 },
        },
      ],
      accounting: { outputObservationCount: 2, rejectedClaimCount: 0 },
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects duplicate sequence numbers and unsupported categories', () => {
    const parsed = ExtractionOutputSchema.safeParse({
      promptVersion: 'document-extraction-v1',
      inputFingerprint: 'c'.repeat(64),
      inputChunkCount: 1,
      observations: [
        {
          ...baseObservation,
          locator: { type: 'pdf_page', page: 1, excerpt: 'A' },
        },
        {
          ...baseObservation,
          categories: ['invented'],
          locator: { type: 'pdf_page', page: 1, excerpt: 'B' },
        },
      ],
      accounting: { outputObservationCount: 2, rejectedClaimCount: 0 },
    });

    expect(parsed.success).toBe(false);
  });

  it('rejects a claim without an exact original excerpt', () => {
    expect(() =>
      parseExtractionOutput({
        promptVersion: 'document-extraction-v1',
        inputFingerprint: 'd'.repeat(64),
        inputChunkCount: 1,
        observations: [
          {
            ...baseObservation,
            originalExcerpt: '',
            locator: { type: 'image_region', x: 0, y: 0, width: 1, height: 1 },
          },
        ],
        accounting: { outputObservationCount: 1, rejectedClaimCount: 0 },
      }),
    ).toThrow();
  });
});
