import { ClarificationOutputSchema } from './clarification-output.schema';

const id = (value: number) =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

describe('clarification flow corpus', () => {
  it('keeps more than five material conflicts reachable with stable open-point identity across workflow states', () => {
    const corpus = ClarificationOutputSchema.parse({
      clarifications: Array.from({ length: 7 }, (_, index) => ({
        conflictObservationId: id(10 + index),
        question: `Décision contradictoire ${index + 1} ?`,
        impactRank: index + 1,
        impactExplanation:
          'Cette décision modifie ce que le client peut comprendre.',
        materialImpact: index % 2 ? 'scope' : 'timing',
        evidenceObservationIds: [id(10 + index), id(30 + index)],
        relatedInformationItemIds: [id(50 + index)],
        openPointContent: `Point ${index + 1} à clarifier.`,
        categories: [index % 2 ? 'overview' : 'planning'],
      })),
      clarificationCount: 7,
    });
    const rows = corpus.clarifications.map((candidate, index) => ({
      id: id(70 + index),
      openPointBlockId: id(70 + index),
      status: 'open',
      version: 1,
      candidate,
    }));

    rows[0] = { ...rows[0], status: 'answered', version: 2 };
    rows[1] = { ...rows[1], status: 'left_open', version: 2 };
    rows[2] = { ...rows[2], status: 'superseded', version: 2 };

    expect(rows).toHaveLength(7);
    expect(rows.map(({ candidate }) => candidate.impactRank)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(rows.slice(0, 3).map(({ status }) => status)).toEqual([
      'answered',
      'left_open',
      'superseded',
    ]);
    expect(
      rows.every(
        ({ id: rowId, openPointBlockId }) => rowId === openPointBlockId,
      ),
    ).toBe(true);
  });
});
