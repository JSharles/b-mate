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

export const ROADMAP_DERIVATION_PROMPT_VERSION = 'roadmap-derivation-v1';
export const ROADMAP_DERIVATION_OUTPUT_CONTRACT = 'roadmap-derivation-v1';

// A roadmap has no register to strike, so this call does one thing: put the
// milestones in the language the client reads. The developer edited these by
// hand — rewriting them into something more graceful would quietly undo that.
//
// Nothing is keyed by id. The milestones go out in order and come back in
// order, and the server zips them with the ids it already holds; asking the
// model to carry an identifier is the failure 45a13ac removed.
export function buildRoadmapDerivationPrompt(input: {
  sectionName: string;
  locale: string;
  milestones: unknown;
}): string {
  return [
    `Prompt version: ${ROADMAP_DERIVATION_PROMPT_VERSION}`,
    `Section heading: ${input.sectionName}`,
    `Locale: ${input.locale}`,
    'Below is a project timeline, in order. Return exactly the same milestones,',
    'in exactly the same order, written in the locale above.',
    'Translate where the language differs, and otherwise leave the wording',
    'alone: it was written or corrected by the person who owns the project.',
    'Never merge two milestones, never drop one, never add one, and never turn',
    '"when" into a date it does not already state.',
    `Milestones: ${JSON.stringify(input.milestones)}`,
  ].join('\n');
}
