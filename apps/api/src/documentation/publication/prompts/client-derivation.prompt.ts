import type { DocumentationCategoryKey } from '@prisma/client';

export const CLIENT_DERIVATION_PROMPT_VERSION = 'client-derivation-v2';
export const CLIENT_DERIVATION_OUTPUT_CONTRACT = 'client-derivation-v2';
export function buildClientDerivationPrompt(input: {
  categoryKey: DocumentationCategoryKey;
  locale: string;
  profile: unknown;
  blocks: unknown;
}): string {
  return [
    `Prompt version: ${CLIENT_DERIVATION_PROMPT_VERSION}`,
    `Category: ${input.categoryKey}`,
    `Locale: ${input.locale}`,
    'Rewrite for the client using the editorial profile. Preserve every fact and every open-point identifier. Never invent.',
    `Profile: ${JSON.stringify(input.profile)}`,
    `Factual reference: ${JSON.stringify(input.blocks)}`,
  ].join('\n');
}
