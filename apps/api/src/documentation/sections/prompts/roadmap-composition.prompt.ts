import { ROADMAP_COMPOSITION_PROMPT_VERSION } from '../../composition/roadmap-output.schema';
import type { CompositionPromptPart } from './composition.prompt';

const LANGUAGE_NAMES: Record<string, string> = {
  fr: 'French',
  en: 'English',
};

// A roadmap section has no brief and no register, so neither appears here. What
// replaces the brief is this prompt itself: a roadmap is always the same
// reading of the same document — what it says about sequence — which is why the
// developer is not asked to describe it.
//
// The standard project phases are deliberately absent. Handing the model an arc
// to fill is how it ends up asserting a "Recette" nobody planned; the phases are
// offered to the developer instead, who owns whichever they accept.
export function buildRoadmapCompositionPrompt(input: {
  locale: string;
  sectionName: string;
  parts: readonly CompositionPromptPart[];
}): string {
  const language = LANGUAGE_NAMES[input.locale] ?? 'English';
  return [
    `Prompt version: ${ROADMAP_COMPOSITION_PROMPT_VERSION}`,
    '',
    'You are reading a project reference document and pulling out its timeline:',
    'the steps the project goes through, in order.',
    '',
    `Section heading: ${input.sectionName}`,
    '',
    'Rules:',
    '- The reference document is the only thing you know about this project.',
    '  Never return a step it does not describe. Do not add the phases projects',
    '  like this one usually have — an absent phase is absent on purpose.',
    '- Copy "when" as the document words it: "Q3 2026", "après la phase pilote",',
    '  "mi-octobre", "dès la validation du cahier des charges". Never convert one',
    '  into a calendar date, and never invent a precision the document does not',
    '  give. When a step is described with no timing at all, say so in the same',
    '  words the document uses, or write that it is not yet fixed.',
    '- Order the milestones as the project runs them, earliest first. The order',
    '  you return is the order that is kept.',
    '- The title is what happens, in a few words. The description says why it',
    '  matters or what it covers, in a sentence or two — null when the document',
    '  adds nothing beyond the title.',
    '- Where the document names what a step contains — the features built during',
    '  a development phase, the deliverables of a design phase — return those as',
    "  that step's substeps, in the order the document gives. Name only what it",
    '  names: never break a phase down because breaking phases down is usual.',
    '  A substep needs no date of its own; leave "when" null unless the document',
    '  states one. Return an empty list for a step the document does not break',
    '  down, and never nest a substep inside another — the roadmap is two levels.',
    '- Do not say where the project currently stands. The document describes a',
    '  plan, not today; the person who owns the project answers that themselves.',
    `- Write in ${language}, whatever language the reference document is in.`,
    '',
    'When the document says nothing about sequence, set outcome to',
    '"nothing_matched" and return no milestones. An empty roadmap the developer',
    'fills in themselves is useful; an invented one is worse than nothing,',
    'because their client reads it as a commitment.',
    '',
    'Reference document:',
    JSON.stringify(input.parts),
  ].join('\n');
}
