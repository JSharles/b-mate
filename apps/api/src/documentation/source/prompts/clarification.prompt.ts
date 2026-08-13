const LANGUAGE_NAMES: Record<string, string> = { fr: 'French', en: 'English' };

// A clarification is a question put to the contributor, not a record of what
// the documents say. It follows the language they read the product in, while
// the canonical statements stay English (specs/018, FR-022).
export function buildClarificationInstructions(locale?: string | null): string {
  const language = LANGUAGE_NAMES[locale ?? ''] ?? 'English';
  return `Clarifications protect the client-facing truth.
- Write every question and every impact explanation in ${language}. They are addressed to a person, not stored as canonical content — which stays English.
- Ask only when an ambiguity or contradiction can materially change timing, scope, behavior, cost, a decision, or a constraint.
- Do not ask stylistic, wording, completeness, or low-value questions.
- Detect contradictions both across documents and within one document.
- Return every material conflict. Never rank by omission or impose a count limit.
- Cite every conflicting observation and every existing information item involved.
- Write one neutral open-point statement that can be published without guessing.`;
}
