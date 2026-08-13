import { RoadmapCompositionOutputSchema } from './roadmap-output.schema';

const milestone = {
  when: 'Q3 2026',
  title: 'Recette',
  description: 'Validation par le client.',
  substeps: [],
};

function output(overrides: Record<string, unknown> = {}) {
  return {
    promptVersion: 'roadmap-composition-v2',
    outcome: 'composed',
    milestones: [milestone],
    changeSummary: 'First roadmap.',
    ...overrides,
  };
}

describe('the roadmap composition contract', () => {
  it('keeps "when" as the document worded it', () => {
    const parsed = RoadmapCompositionOutputSchema.parse(
      output({ milestones: [{ ...milestone, when: 'après la phase pilote' }] }),
    );

    expect(parsed.milestones[0].when).toBe('après la phase pilote');
  });

  it('accepts a milestone the document adds nothing to', () => {
    expect(
      RoadmapCompositionOutputSchema.safeParse(
        output({ milestones: [{ ...milestone, description: null }] }),
      ).success,
    ).toBe(true);
  });

  // A roadmap is the shape a model most wants to invent, so "nothing matched"
  // has to hold in both directions or it becomes a label attached to content it
  // produced anyway.
  it('refuses milestones under an outcome that matched nothing', () => {
    expect(
      RoadmapCompositionOutputSchema.safeParse(
        output({ outcome: 'nothing_matched' }),
      ).success,
    ).toBe(false);
  });

  it('refuses an empty roadmap that claims to have composed one', () => {
    expect(
      RoadmapCompositionOutputSchema.safeParse(output({ milestones: [] }))
        .success,
    ).toBe(false);
  });

  // Ids are minted server-side and never asked of the model (45a13ac).
  it('refuses a milestone carrying an identifier', () => {
    expect(
      RoadmapCompositionOutputSchema.safeParse(
        output({ milestones: [{ ...milestone, id: 'm0' }] }),
      ).success,
    ).toBe(false);
  });

  // What sits inside a long phase, named only where the document names it.
  describe('what a milestone contains', () => {
    const substep = { when: null, title: 'Feature 1', description: null };

    it('accepts a step inside a milestone, dated or not', () => {
      const parsed = RoadmapCompositionOutputSchema.parse(
        output({
          milestones: [
            {
              ...milestone,
              substeps: [substep, { ...substep, when: 'juillet' }],
            },
          ],
        }),
      );

      expect(parsed.milestones[0].substeps).toHaveLength(2);
      expect(parsed.milestones[0].substeps[0].when).toBeNull();
    });

    // A contract that cannot express a third level is worth more than a rule
    // saying not to produce one.
    it('cannot express a step inside a step', () => {
      expect(
        RoadmapCompositionOutputSchema.safeParse(
          output({
            milestones: [
              { ...milestone, substeps: [{ ...substep, substeps: [] }] },
            ],
          }),
        ).success,
      ).toBe(false);
    });

    it('refuses a step with no name', () => {
      expect(
        RoadmapCompositionOutputSchema.safeParse(
          output({
            milestones: [
              { ...milestone, substeps: [{ ...substep, title: ' ' }] },
            ],
          }),
        ).success,
      ).toBe(false);
    });
  });
});
