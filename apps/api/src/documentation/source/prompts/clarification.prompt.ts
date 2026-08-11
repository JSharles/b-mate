export function buildClarificationInstructions(): string {
  return `Clarifications protect the client-facing truth.
- Ask only when an ambiguity or contradiction can materially change timing, scope, behavior, cost, a decision, or a constraint.
- Do not ask stylistic, wording, completeness, or low-value questions.
- Detect contradictions both across documents and within one document.
- Return every material conflict. Never rank by omission or impose a count limit.
- Cite every conflicting observation and every existing information item involved.
- Write one neutral open-point statement that can be published without guessing.`;
}
