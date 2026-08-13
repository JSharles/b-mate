import { SECTION_COMPOSITION_PROMPT_VERSION } from '../../composition/composition-output.schema';

export interface CompositionPromptPart {
  title: string;
  blocks: { kind: 'paragraph' | 'gap'; text: string }[];
}

// Composition produces the section's factual layer, not the text the client
// finally reads: it selects from the reference document and writes plainly, in
// English. The section's four editorial dimensions are deliberately absent from
// this prompt — they govern derivation, which is where register and locale are
// applied. Asking one call to both select and strike a tone is the kind of
// doubled obligation that made extraction fail four ways.
export function buildCompositionPrompt(input: {
  sectionName: string;
  instructions: string;
  parts: readonly CompositionPromptPart[];
}): string {
  return [
    `Prompt version: ${SECTION_COMPOSITION_PROMPT_VERSION}`,
    '',
    'You are composing one section of a project documentation for a client to read.',
    'The section was defined by the person who owns the project. Its heading and',
    'its brief are below, followed by the project reference document in full.',
    '',
    `Section heading: ${input.sectionName}`,
    `What this section should cover: ${input.instructions}`,
    '',
    'Rules:',
    '- The reference document is the only thing you know about this project. Never',
    '  state anything it does not say. Do not infer, extrapolate, or fill a gap with',
    '  what is usually true of projects like this one.',
    '- Select only what serves this section brief. Material that belongs in no',
    '  section is left out; material that serves two sections may be used by both.',
    '  You are choosing a view of the document, not emptying it.',
    '- Write continuous prose, not one paragraph per sentence of the document.',
    '- Where the document marks something as unsettled and this section covers it,',
    '  keep it as an open_point block rather than writing around it.',
    '- Write in English, like the reference document you are reading. Register, level',
    '  of detail and language for the client are applied later and are not your',
    '  concern.',
    '',
    'When the document holds nothing that serves this brief, set outcome to',
    '"nothing_matched" and return no blocks. Say so plainly rather than reaching for',
    'loosely related material to avoid coming back empty: a section that admits it',
    'has nothing is useful, and one padded with the nearest available facts is not.',
    '',
    'Separately from the content, raise what you could not resolve from the document',
    'alone — a contradiction between two passages, a date that is implied but never',
    'stated, a decision referred to but never recorded. Each question says why it',
    'matters to what the client will end up reading. Do not raise a question you can',
    'answer from the document, and do not raise one about material this section does',
    'not cover.',
    '',
    'Reference document:',
    JSON.stringify(input.parts),
  ].join('\n');
}
