import { DOCUMENTATION_CATEGORY_KEYS } from '../../documentation-categories';
import { buildClarificationInstructions } from './clarification.prompt';

export const SOURCE_CONSOLIDATION_PROMPT_VERSION = 'source-consolidation-v1';
export const SOURCE_CONSOLIDATION_OUTPUT_CONTRACT =
  'diaphane.source-consolidation.v1';

export function buildSourceConsolidationPrompt(input: {
  inputFingerprint: string;
  observationCount: number;
}): string {
  return [
    `Prompt version: ${SOURCE_CONSOLIDATION_PROMPT_VERSION}`,
    `Input fingerprint: ${input.inputFingerprint}`,
    `Input observation count: ${input.observationCount}`,
    `Categories: ${DOCUMENTATION_CATEGORY_KEYS.join(', ')}`,
    '',
    'Assign exactly one disposition to every supplied observation.',
    'Use support for exact or semantic duplicates and identify the stable target item.',
    'Use supersede only when the new observation unambiguously replaces the target fact.',
    'Use conflict when evidence is contradictory or materially ambiguous; never guess.',
    'Use open for a material self-conflict that has no current canonical target.',
    'Use exclude only for non-material content, with a concrete reason.',
    'Never emit a claim, item ID, observation ID, or category absent from the input.',
    'Do not rewrite current facts for style. Preserve stable item identity.',
    'Write every canonical value in English; it is the one form the client-facing rewrite reads.',
    buildClarificationInstructions(),
    'Return only data matching the structured output contract.',
  ].join('\n');
}
