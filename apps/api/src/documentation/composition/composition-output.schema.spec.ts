import {
  SECTION_COMPOSITION_PROMPT_VERSION,
  SectionCompositionOutputSchema,
} from './composition-output.schema';

function output(overrides: Record<string, unknown> = {}) {
  return {
    promptVersion: SECTION_COMPOSITION_PROMPT_VERSION,
    outcome: 'composed',
    blocks: [{ kind: 'paragraph', text: 'The launch is planned for October.' }],
    changeSummary: 'First composition of this section.',
    ...overrides,
  };
}

describe('section composition output', () => {
  it('accepts a proposal with content and no questions', () => {
    expect(SectionCompositionOutputSchema.parse(output()).outcome).toBe(
      'composed',
    );
  });

  // What the reference document leaves unsettled stays unsettled in a section
  // rather than being written around.
  it('keeps an open point as its own kind of block', () => {
    const parsed = SectionCompositionOutputSchema.parse(
      output({
        blocks: [{ kind: 'open_point', text: 'The budget is not confirmed.' }],
      }),
    );

    expect(parsed.blocks[0].kind).toBe('open_point');
  });

  it('accepts a composition that matched nothing', () => {
    expect(
      SectionCompositionOutputSchema.parse(
        output({ outcome: 'nothing_matched', blocks: [] }),
      ).blocks,
    ).toEqual([]);
  });

  it('refuses "nothing matched" attached to content that exists', () => {
    expect(
      SectionCompositionOutputSchema.safeParse(
        output({ outcome: 'nothing_matched' }),
      ).success,
    ).toBe(false);
  });

  it('refuses an empty composition that claims to have composed', () => {
    expect(
      SectionCompositionOutputSchema.safeParse(output({ blocks: [] })).success,
    ).toBe(false);
  });

  it('refuses an output from a different prompt version', () => {
    expect(
      SectionCompositionOutputSchema.safeParse(
        output({ promptVersion: 'section-composition-v2' }),
      ).success,
    ).toBe(false);
  });

  // Nothing here asks the model to echo an identifier back, so an identifier
  // arriving anyway is a contract nobody wrote.
  it('refuses an echoed identifier smuggled in as an extra field', () => {
    expect(
      SectionCompositionOutputSchema.safeParse(
        output({ sectionId: '123e4567-e89b-42d3-a456-426614174000' }),
      ).success,
    ).toBe(false);
  });
});
