import { buildClarificationInstructions } from './clarification.prompt';

describe('clarification prompt', () => {
  it('asks only material client-impacting questions, retains self-conflicts, and never caps output', () => {
    const prompt = buildClarificationInstructions();
    expect(prompt).toContain('Do not ask stylistic');
    expect(prompt).toContain('within one document');
    expect(prompt).toContain('Return every material conflict');
    expect(prompt).not.toMatch(/maximum|at most|top five/iu);
  });
});
