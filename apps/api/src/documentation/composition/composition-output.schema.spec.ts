import {
  SECTION_COMPOSITION_PROMPT_VERSION,
  SectionCompositionOutputSchema,
  validateCompositionReferences,
} from './composition-output.schema';

const itemA = '123e4567-e89b-42d3-a456-426614174000';
const itemB = '123e4567-e89b-42d3-a456-426614174001';
const unknownItem = '123e4567-e89b-42d3-a456-4266141740ff';

function output(overrides: Record<string, unknown> = {}) {
  return {
    promptVersion: SECTION_COMPOSITION_PROMPT_VERSION,
    outcome: 'composed',
    blocks: [
      {
        type: 'fact',
        text: 'The launch is planned for October.',
        informationItemIds: [itemA],
      },
    ],
    questions: [],
    changeSummary: 'First composition of this section.',
    provenanceSummary: [{ label: 'Statement of work', itemCount: 1 }],
    ...overrides,
  };
}

describe('section composition output', () => {
  it('accepts a proposal with content and no questions', () => {
    expect(SectionCompositionOutputSchema.parse(output()).outcome).toBe(
      'composed',
    );
  });

  it('accepts questions carried beside the content', () => {
    const parsed = SectionCompositionOutputSchema.parse(
      output({
        questions: [
          {
            question: 'Is the October launch date confirmed?',
            impactExplanation:
              'The client would read a date that nothing in the documents confirms.',
            informationItemIds: [itemA],
          },
        ],
      }),
    );

    expect(parsed.questions).toHaveLength(1);
    expect(parsed.blocks).toHaveLength(1);
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

  it('refuses a block resting on nothing', () => {
    expect(
      SectionCompositionOutputSchema.safeParse(
        output({
          blocks: [
            { type: 'fact', text: 'Something.', informationItemIds: [] },
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it('refuses an open point with no stable identifier', () => {
    expect(
      SectionCompositionOutputSchema.safeParse(
        output({
          blocks: [
            {
              type: 'open_point',
              text: 'The budget is unconfirmed.',
              informationItemIds: [itemA],
            },
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it('refuses an output from a different prompt version', () => {
    expect(
      SectionCompositionOutputSchema.safeParse(
        output({ promptVersion: 'section-composition-v0' }),
      ).success,
    ).toBe(false);
  });

  it('refuses an echoed identifier smuggled in as an extra field', () => {
    expect(
      SectionCompositionOutputSchema.safeParse(output({ sectionId: itemA }))
        .success,
    ).toBe(false);
  });
});

describe('validating what a composition cited', () => {
  it('accepts a selection that leaves statements out', () => {
    const parsed = SectionCompositionOutputSchema.parse(output());

    expect(() =>
      validateCompositionReferences(parsed, [itemA, itemB]),
    ).not.toThrow();
  });

  it('refuses a citation naming a statement we never sent', () => {
    const parsed = SectionCompositionOutputSchema.parse(
      output({
        blocks: [
          {
            type: 'fact',
            text: 'Invented provenance.',
            informationItemIds: [unknownItem],
          },
        ],
      }),
    );

    expect(() => validateCompositionReferences(parsed, [itemA])).toThrow(
      'SECTION_COMPOSITION_UNKNOWN_REFERENCE',
    );
  });

  it('checks an open point identifier too', () => {
    const parsed = SectionCompositionOutputSchema.parse(
      output({
        blocks: [
          {
            type: 'open_point',
            text: 'The budget is unconfirmed.',
            informationItemIds: [itemA],
            openPointId: unknownItem,
          },
        ],
      }),
    );

    expect(() => validateCompositionReferences(parsed, [itemA])).toThrow(
      'SECTION_COMPOSITION_UNKNOWN_REFERENCE',
    );
  });

  it('checks what a question claims to be about', () => {
    const parsed = SectionCompositionOutputSchema.parse(
      output({
        questions: [
          {
            question: 'Which budget applies?',
            impactExplanation: 'The client would read the wrong figure.',
            informationItemIds: [unknownItem],
          },
        ],
      }),
    );

    expect(() => validateCompositionReferences(parsed, [itemA])).toThrow(
      'SECTION_COMPOSITION_UNKNOWN_REFERENCE',
    );
  });

  it('accepts a question about nothing in particular', () => {
    const parsed = SectionCompositionOutputSchema.parse(
      output({
        questions: [
          {
            question: 'Has a launch date been agreed at all?',
            impactExplanation: 'The section would say nothing about timing.',
            informationItemIds: [],
          },
        ],
      }),
    );

    expect(() => validateCompositionReferences(parsed, [itemA])).not.toThrow();
  });
});
