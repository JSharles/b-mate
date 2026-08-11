import { ClarificationOutputSchema } from './clarification-output.schema';

const id = (value: number) =>
  `00000000-0000-4000-8000-${value.toString().padStart(12, '0')}`;

describe('ClarificationOutputSchema', () => {
  const candidate = {
    conflictObservationId: id(1),
    question: 'Quelle date de lancement faut-il communiquer ?',
    impactRank: 1,
    impactExplanation: 'La date modifie le planning visible par le client.',
    materialImpact: 'timing',
    evidenceObservationIds: [id(1), id(2)],
    relatedInformationItemIds: [id(3)],
    openPointContent: 'La date de lancement reste à confirmer.',
    categories: ['planning'],
  };

  it('accepts all ranked material conflicts without a numerical cap', () => {
    const clarifications = Array.from({ length: 8 }, (_, index) => ({
      ...candidate,
      conflictObservationId: id(10 + index),
      evidenceObservationIds: [id(10 + index), id(30 + index)],
      impactRank: index + 1,
    }));
    expect(
      ClarificationOutputSchema.parse({ clarifications, clarificationCount: 8 })
        .clarifications,
    ).toHaveLength(8);
  });

  it('rejects stylistic questions, incomplete evidence, duplicate conflicts, and bad accounting', () => {
    expect(() =>
      ClarificationOutputSchema.parse({
        clarifications: [{ ...candidate, materialImpact: 'style' }],
        clarificationCount: 1,
      }),
    ).toThrow();
    expect(() =>
      ClarificationOutputSchema.parse({
        clarifications: [{ ...candidate, evidenceObservationIds: [id(1)] }],
        clarificationCount: 1,
      }),
    ).toThrow();
    expect(() =>
      ClarificationOutputSchema.parse({
        clarifications: [candidate, candidate],
        clarificationCount: 2,
      }),
    ).toThrow();
    expect(() =>
      ClarificationOutputSchema.parse({
        clarifications: [candidate],
        clarificationCount: 0,
      }),
    ).toThrow();
  });

  it('preserves a self-conflict before any canonical item exists', () => {
    expect(
      ClarificationOutputSchema.parse({
        clarifications: [{ ...candidate, relatedInformationItemIds: [] }],
        clarificationCount: 1,
      }).clarifications[0].relatedInformationItemIds,
    ).toEqual([]);
  });
});
