import type { InformationItemKind, InformationItemState } from '@prisma/client';
import { SECTION_COMPOSITION_PROMPT_VERSION } from '../../composition/composition-output.schema';

export interface CompositionPromptStatement {
  id: string;
  kind: InformationItemKind;
  state: InformationItemState;
  content: string;
}

// Composition produces the section's factual layer, not the text the client
// finally reads: it selects from the canonical source and writes plainly, in
// English, exactly as feature 016's per-category drafting did. The section's
// four editorial dimensions are deliberately absent from this prompt — they
// govern derivation, which is where register and locale are applied. Asking one
// call to both select facts and strike a tone is the kind of doubled obligation
// that made extraction fail four ways.
export function buildCompositionPrompt(input: {
  sectionName: string;
  instructions: string;
  sourceRevisionId: string;
  statements: readonly CompositionPromptStatement[];
}): string {
  return [
    `Prompt version: ${SECTION_COMPOSITION_PROMPT_VERSION}`,
    `Source revision: ${input.sourceRevisionId}`,
    '',
    'You are composing one section of a project documentation for a client to read.',
    'The section was defined by the person who owns the project. Its heading and',
    'its brief are below, followed by every statement the project canonical source',
    'currently holds.',
    '',
    `Section heading: ${input.sectionName}`,
    `What this section should cover: ${input.instructions}`,
    '',
    'Rules:',
    '- Select only the statements that serve this section brief. A statement that',
    '  belongs in no section is left out; a statement that serves two sections may',
    '  be used by both. You are choosing a view of the source, not emptying a bucket.',
    '- Never state anything the statements do not support. Do not infer, extrapolate,',
    '  or fill a gap with what is usually true of projects like this one.',
    '- Every block cites the statements it rests on through informationItemIds, using',
    '  the ids given below and no others.',
    '- Preserve a statement carrying an unresolved point as an open_point block.',
    '- Write in English, like the canonical source you are reading. Register, level of',
    '  detail and language for the client are applied later and are not your concern.',
    '',
    'When the source holds nothing that serves this brief, set outcome to',
    '"nothing_matched" and return no blocks. Say so plainly rather than reaching for',
    'loosely related material to avoid coming back empty: a section that admits it',
    'has nothing is useful, and one padded with the nearest available facts is not.',
    '',
    'Separately from the content, raise what you could not resolve from the',
    'statements alone — a contradiction between two of them, a date that is implied',
    'but never stated, a decision referred to but never recorded. Each question says',
    'why it matters to what the client will end up reading. Do not raise a question',
    'you can answer from the statements, and do not raise one about material this',
    'section does not cover.',
    '',
    'Statements:',
    JSON.stringify(input.statements),
  ].join('\n');
}
