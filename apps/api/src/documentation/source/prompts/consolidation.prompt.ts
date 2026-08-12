import { DOCUMENTATION_CATEGORY_KEYS } from '../../documentation-categories';
import { buildClarificationInstructions } from './clarification.prompt';

export const SOURCE_CONSOLIDATION_PROMPT_VERSION = 'source-consolidation-v2';
export const SOURCE_CONSOLIDATION_OUTPUT_CONTRACT =
  'diaphane.source-consolidation.v2';

export function buildSourceConsolidationPrompt(input: {
  inputFingerprint: string;
  observationCount: number;
  currentItemCount: number;
}): string {
  return [
    `Prompt version: ${SOURCE_CONSOLIDATION_PROMPT_VERSION}`,
    `Input fingerprint: ${input.inputFingerprint}`,
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
    `Categories: ${DOCUMENTATION_CATEGORY_KEYS.join(', ')}`,
    '',
    'Assign exactly one disposition to every supplied observation.',
    'Use support for exact or semantic duplicates and identify the stable target item.',
    'Use supersede only when the new observation unambiguously replaces the target fact.',
    'Use conflict when evidence is contradictory or materially ambiguous; never guess.',
    'Use open for a material self-conflict that has no current canonical target.',
    'Use exclude only for non-material content, with a concrete reason.',
    'Refer to observations and items only by the short ref given in the input, such as o12 or i3. Copy it exactly; never invent one and never write an identifier.',
    'Never emit a claim, ref, or category absent from the input.',
    'Do not rewrite current facts for style. Preserve stable item identity.',
    'Write every canonical value in English; it is the one form the client-facing rewrite reads.',
    buildClarificationInstructions(),
    'Return only data matching the structured output contract.',
  ].join('\n');
}
