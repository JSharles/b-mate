import { CLIENT_DERIVATION_PROMPT_VERSION } from '../../publication/prompts/client-derivation.prompt';
export interface EditorialProfileValues {
  length: 'concise' | 'balanced' | 'detailed';
  pedagogy: 'direct' | 'guided' | 'highly_explanatory';
  technicalFamiliarity: 'novice' | 'informed' | 'technical';
  tone: 'reassuring' | 'neutral' | 'direct' | 'formal';
  guidance: string | null;
}
export const EDITORIAL_PREVIEW_PROMPT_VERSION = 'editorial-preview-v2';
export const EDITORIAL_PREVIEW_OUTPUT_CONTRACT = 'editorial-preview-v2';
export function buildEditorialPreviewPrompt(input: {
  categoryKey: string;
  factualBlocks: unknown;
  profile: EditorialProfileValues;
}): string {
  return [
    `Prompt version: ${EDITORIAL_PREVIEW_PROMPT_VERSION}`,
    `Derivation rules: ${CLIENT_DERIVATION_PROMPT_VERSION}`,
    `Category: ${input.categoryKey}`,
    'Create a representative client preview. Preserve every fact and open-point identifier. Do not invent.',
    `Editorial profile: ${JSON.stringify(input.profile)}`,
    `Factual reference: ${JSON.stringify(input.factualBlocks)}`,
  ].join('\n');
}
