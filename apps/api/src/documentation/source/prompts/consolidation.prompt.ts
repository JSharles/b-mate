import { buildClarificationInstructions } from './clarification.prompt';

export const SOURCE_CONSOLIDATION_PROMPT_VERSION = 'source-consolidation-v3';
export const SOURCE_CONSOLIDATION_OUTPUT_CONTRACT =
  'diaphane.source-consolidation.v3';

export function buildSourceConsolidationPrompt(input: {
  observationCount: number;
  currentItemCount: number;
}): string {
  return [
    `Prompt version: ${SOURCE_CONSOLIDATION_PROMPT_VERSION}`,
    `Input observation count: ${input.observationCount}`,
    `Current item count: ${input.currentItemCount}`,
    // Told only "never reference something absent from the input", the model
    // still answered `targetItemRef: "i1"` against an empty canonical source.
    // Stating the count, and what follows from a count of zero, leaves nothing
    // to infer.
    ...(input.currentItemCount === 0
      ? [
          'The canonical source is empty: there is no item to support, supersede or conflict with. Every disposition must be add or exclude, and no disposition may carry a target item ref.',
        ]
      : [
          `Item refs run from i0 to i${input.currentItemCount - 1}. Never write one outside that range.`,
        ]),
    '',
    // Asked for one record per observation plus counts that had to tally, the
    // model kept losing its place on a long page — a different bookkeeping slip
    // every run, never a mistake of judgement. It now reports only what it
    // alone can decide; the ledger is rebuilt on our side.
    'List only the observations that are NOT plain additions. Every observation you do not list is added to the canonical source as new information.',
    'Do not restate additions, do not number anything, and do not report counts.',
    'List support for exact or semantic duplicates, naming the target item.',
    'List supersede only when the observation unambiguously replaces the target fact.',
    'List conflict when evidence is contradictory or materially ambiguous; never guess.',
    'List open for a material self-conflict that has no current canonical target.',
    'List exclude only for non-material content, with a concrete reason.',
    'Every conflict and every open you list needs exactly one clarification naming that same observation. If you cannot write the question, do not list the conflict.',
    'Refer to observations and items only by the short ref given in the input, such as o12 or i3. Copy it exactly; never invent one and never write an identifier.',
    'Never emit a claim or ref absent from the input.',
    'Do not rewrite current facts for style. Preserve stable item identity.',
    'Write every canonical value in English; it is the one form the client-facing rewrite reads.',
    buildClarificationInstructions(),
    'Return only data matching the structured output contract.',
  ].join('\n');
}
