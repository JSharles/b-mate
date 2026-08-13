import type { InformationItemKind, InformationItemState } from '@prisma/client';
import { REFERENCE_DOCUMENT_PROMPT_VERSION } from '../reference-output.schema';

export interface ReferenceStatement {
  // A short reference the model can copy back without slipping. It never sees
  // an identifier — see reference-token.ts for what that cost the first time.
  ref: string;
  kind: InformationItemKind;
  state: InformationItemState;
  content: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  fr: 'French',
  en: 'English',
};

// This writes the developer's reference document. It is the only place in the
// product that turns the canonical source into something read end to end — the
// sections written for a client are a different job, on a slice, in a chosen
// register.
//
// The statements arrive in English, as the canonical source has been since
// 2026-08-12. The document is written in the developer's own language: it is
// written for them, and leaving it in English would reproduce the complaint
// that put the language requirement in the spec (FR-022a).
export function buildReferenceDocumentPrompt(input: {
  locale: string;
  sourceRevisionId: string;
  statements: readonly ReferenceStatement[];
}): string {
  const language = LANGUAGE_NAMES[input.locale] ?? 'English';
  return [
    `Prompt version: ${REFERENCE_DOCUMENT_PROMPT_VERSION}`,
    `Source revision: ${input.sourceRevisionId}`,
    '',
    'You are writing the reference document for the developer who runs this',
    'project. It is what they read to know where the project stands. It is not',
    'read by their client.',
    '',
    `Write it in ${language}. The statements below are in English; the document`,
    'is not.',
    '',
    'Rules:',
    '- Organise it into named parts, and write continuous prose under each. It',
    '  is read from top to bottom, not scanned as a list.',
    '- A passage draws several statements together into one paragraph. Do not',
    '  write one passage per statement: that is the list this document exists to',
    '  replace, and it is what makes the document too long to be read or even',
    '  finished.',
    '- Group what belongs together. Order the parts so the document builds:',
    '  what the project is before how it works, and so on.',
    '- Every passage names the statements it rests on, using the refs given',
    '  below ("i0", "i7") and no others. A passage that rests on nothing, or on',
    '  a ref that was not given, will be refused.',
    '- Say nothing the statements do not support. Do not infer, do not fill a',
    '  gap with what is usually true of projects like this one, and do not',
    '  smooth two statements that disagree into one that sounds settled.',
    '- A statement carrying an unresolved point stays an unresolved point: write',
    '  it as an open_point passage, in place, where it applies. A document that',
    '  reads as if everything were settled is the one failure this product',
    '  exists to prevent.',
    '- You may leave a statement out if it carries nothing a reader needs. You',
    '  may not add one.',
    '',
    'When the statements hold nothing a developer could use as a reference, set',
    'outcome to "nothing_usable" and return no parts. Saying so is useful;',
    'padding a document to look complete is not.',
    '',
    'Statements:',
    JSON.stringify(input.statements),
  ].join('\n');
}
