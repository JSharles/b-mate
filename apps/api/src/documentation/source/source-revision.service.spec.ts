import {
  buildConsolidationPlan,
  ConsolidationDisposition,
  ConsolidationObservation,
  CurrentCanonicalItem,
} from './source-revision.service';

const budget: CurrentCanonicalItem = {
  revisionItemId: 'revision-item-budget',
  informationItemId: 'item-budget',
  kind: 'figure',
  state: 'confirmed',
  content: 'Le budget validé est de 10 000 €.',
  sortOrder: 0,
  categories: ['overview'],
  provenance: [
    {
      documentObservationId: 'observation-budget-a',
      role: 'supports',
      exactContentHash: 'a'.repeat(64),
    },
  ],
};

const launch: CurrentCanonicalItem = {
  revisionItemId: 'revision-item-launch',
  informationItemId: 'item-launch',
  kind: 'date',
  state: 'confirmed',
  content: 'Le lancement est prévu le 1er octobre 2026.',
  sortOrder: 1,
  categories: ['planning'],
  provenance: [
    {
      documentObservationId: 'observation-launch-a',
      role: 'supports',
      exactContentHash: 'b'.repeat(64),
    },
  ],
};

function observation(
  overrides: Partial<ConsolidationObservation>,
): ConsolidationObservation {
  return {
    id: 'observation-new',
    kind: 'fact',
    normalizedContent: 'Une information.',
    exactContentHash: 'c'.repeat(64),
    categories: ['other'],
    ...overrides,
  };
}

function disposition(
  overrides: Partial<ConsolidationDisposition>,
): ConsolidationDisposition {
  return {
    observationId: 'observation-new',
    action: 'add',
    reason: 'Information nouvelle et explicite.',
    ...overrides,
  };
}

describe('buildConsolidationPlan', () => {
  it.each(['exact', 'semantic'] as const)(
    'deduplicates %s support while retaining every provenance origin',
    (match) => {
      const duplicate = observation({
        id: 'observation-budget-b',
        normalizedContent: budget.content,
        exactContentHash: match === 'exact' ? 'a'.repeat(64) : 'd'.repeat(64),
        categories: ['overview'],
      });

      const plan = buildConsolidationPlan(
        [budget, launch],
        [duplicate],
        [
          disposition({
            observationId: duplicate.id,
            action: 'support',
            targetInformationItemId: budget.informationItemId,
            match,
          }),
        ],
      );

      expect(plan.items).toHaveLength(2);
      expect(plan.items[0]).toMatchObject({
        informationItemId: budget.informationItemId,
        content: budget.content,
        provenance: expect.arrayContaining([
          expect.objectContaining({
            documentObservationId: 'observation-budget-a',
          }),
          expect.objectContaining({
            documentObservationId: duplicate.id,
            role: 'supports',
          }),
        ]),
      });
      expect(plan.impactedCategories).toEqual([]);
      expect(plan.changes).toEqual([
        expect.objectContaining({ kind: 'provenance_added' }),
      ]);
    },
  );

  it('supersedes unambiguous information with stable identity and isolated impact', () => {
    const update = observation({
      id: 'observation-launch-update',
      kind: 'date',
      normalizedContent: 'Le lancement est déplacé au 15 octobre 2026.',
      categories: ['planning'],
    });

    const plan = buildConsolidationPlan(
      [budget, launch],
      [update],
      [
        disposition({
          observationId: update.id,
          action: 'supersede',
          targetInformationItemId: launch.informationItemId,
        }),
      ],
    );

    expect(plan.items).toEqual([
      expect.objectContaining({
        informationItemId: budget.informationItemId,
        content: budget.content,
      }),
      expect.objectContaining({
        informationItemId: launch.informationItemId,
        previousRevisionItemId: launch.revisionItemId,
        content: update.normalizedContent,
      }),
    ]);
    expect(plan.impactedCategories).toEqual(['planning']);
    expect(plan.changes).toEqual([
      expect.objectContaining({
        informationItemId: launch.informationItemId,
        kind: 'superseded',
      }),
    ]);
  });

  it('adds multilingual normalized information once and copies all unchanged items', () => {
    const translated = observation({
      id: 'observation-beta',
      normalizedContent:
        'Une phase bêta interne de cinq jours précède le lancement.',
      sourceLanguage: 'en',
      categories: ['planning'],
    });

    const plan = buildConsolidationPlan(
      [budget, launch],
      [translated],
      [disposition({ observationId: translated.id, action: 'add' })],
    );

    expect(plan.items).toHaveLength(3);
    expect(plan.items[2]).toMatchObject({
      informationItemId: null,
      content: translated.normalizedContent,
      categories: ['planning'],
    });
    expect(plan.impactedCategories).toEqual(['planning']);
  });

  it('rejects unknown, duplicate, or missing observation dispositions', () => {
    const known = observation({ id: 'observation-known' });

    expect(() =>
      buildConsolidationPlan(
        [],
        [known],
        [disposition({ observationId: 'observation-unknown' })],
      ),
    ).toThrow('unknown observation');
    expect(() =>
      buildConsolidationPlan(
        [],
        [known],
        [
          disposition({ observationId: known.id }),
          disposition({ observationId: known.id }),
        ],
      ),
    ).toThrow('exactly one disposition');
    expect(() => buildConsolidationPlan([], [known], [])).toThrow(
      'exactly one disposition',
    );
  });
});
