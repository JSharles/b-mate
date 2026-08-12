import { ClarificationOutputSchema } from './clarification-output.schema';

// Short references, not identifiers: the model is never asked to copy a UUID
// back — see reference-token.ts for the single mistyped character that cost a
// whole consolidation.
const obs = (value: number) => `o${value}`;
const item = (value: number) => `i${value}`;

describe('ClarificationOutputSchema', () => {
  const candidate = {
    conflictObservationRef: obs(1),
    question: 'Quelle date de lancement faut-il communiquer ?',
    impactRank: 1,
    impactExplanation: 'La date modifie le planning visible par le client.',
    materialImpact: 'timing',
    evidenceObservationRefs: [obs(1), obs(2)],
    relatedItemRefs: [item(3)],
    openPointContent: 'La date de lancement reste à confirmer.',
  };

  it('accepts all ranked material conflicts without a numerical cap', () => {
    const clarifications = Array.from({ length: 8 }, (_, index) => ({
      ...candidate,
      conflictObservationRef: obs(10 + index),
      evidenceObservationRefs: [obs(10 + index), obs(30 + index)],
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
        clarifications: [{ ...candidate, evidenceObservationRefs: [obs(1)] }],
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
        clarifications: [{ ...candidate, relatedItemRefs: [] }],
        clarificationCount: 1,
      }).clarifications[0].relatedItemRefs,
    ).toEqual([]);
  });
});
