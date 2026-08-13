export const CLIENT_DERIVATION_PROMPT_VERSION = 'client-derivation-v4';
export const CLIENT_DERIVATION_OUTPUT_CONTRACT = 'client-derivation-v4';

export interface ClientDerivationEditorial {
  length: string;
  pedagogy: string;
  technicalFamiliarity: string;
  tone: string;
}

// Register is stated per section rather than per project: one section answers a
// budget question and another explains an architecture, and a single project-wide
// voice stopped meaning anything once its author chose the headings
// (specs/017 research Decision 6).
export function buildClientDerivationPrompt(input: {
  sectionName: string;
  locale: string;
  editorial: ClientDerivationEditorial;
  blocks: unknown;
}): string {
  return [
    `Prompt version: ${CLIENT_DERIVATION_PROMPT_VERSION}`,
    `Section heading: ${input.sectionName}`,
    `Locale: ${input.locale}`,
    'Rewrite this section for the client in the register below. Preserve every',
    'fact and every open-point identifier. Never invent, and never drop a point',
    'because it is awkward to phrase.',
    'The heading above is already shown to the client, so start with the content',
    'itself: do not repeat the heading, and do not open with a title of your own.',
    `Register: ${JSON.stringify(input.editorial)}`,
    `Factual reference: ${JSON.stringify(input.blocks)}`,
  ].join('\n');
}
