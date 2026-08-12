import {
  FactualDraftOutputSchema,
  validateFactualCoverage,
} from './factual-draft-output.schema';
const id = '00000000-0000-4000-8000-000000000001';
const base = {
  promptVersion: 'factual-draft-v2' as const,
  categoryKey: 'overview' as const,
  blocks: [{ type: 'fact' as const, text: 'Fact', informationItemIds: [id] }],
  changeSummary: 'Added fact',
  provenanceSummary: [{ label: 'Brief', itemCount: 1 }],
};
describe('factual draft output', () => {
  it('validates exact coverage', () => {
    const output = FactualDraftOutputSchema.parse(base);
    expect(() => validateFactualCoverage(output, [id])).not.toThrow();
  });
  it('rejects missing, unknown, and duplicate coverage differences', () => {
    const output = FactualDraftOutputSchema.parse(base);
    expect(() => validateFactualCoverage(output, [])).toThrow('INCOMPLETE');
    expect(() =>
      validateFactualCoverage(output, ['00000000-0000-4000-8000-000000000002']),
    ).toThrow('INCOMPLETE');
  });
  it('requires stable ids for open points', () =>
    expect(
      FactualDraftOutputSchema.safeParse({
        ...base,
        blocks: [{ type: 'open_point', text: 'TBD', informationItemIds: [id] }],
      }).success,
    ).toBe(false));
});
