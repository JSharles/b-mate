import { REFERENCE_DOCUMENT_PROMPT_VERSION } from '../reference-output.schema';

export interface PromptDocument {
  ref: string;
  title: string;
}

export interface PromptNote {
  content: string;
  context: string | null;
}

const LANGUAGE_NAMES: Record<string, string> = {
  fr: 'French',
  en: 'English',
};

// One call does the whole job: structure what the documents say, clean it, and
// say plainly what it could not settle. It replaced a four-stage pipeline that
// extracted facts, merged them, and wrote from the merge — machinery bought for
// a scale this product does not have.
export function buildReferenceDocumentPrompt(input: {
  locale: string;
  documents: readonly PromptDocument[];
  notes: readonly PromptNote[];
}): string {
  const language = LANGUAGE_NAMES[input.locale] ?? 'English';
  const lines = [
    `Prompt version: ${REFERENCE_DOCUMENT_PROMPT_VERSION}`,
    '',
    'You are writing the reference document for the developer who runs this',
    'project. It is what they read to know where the project stands. Their',
    'client does not read it.',
    '',
    `Write it in ${language}, whatever language the documents are in.`,
    '',
    'The documents follow this prompt, each introduced by its reference and',
    'title. They are uneven: some are precise, some are drafts, some contradict',
    'each other.',
    '',
    'Documents:',
    ...input.documents.map(
      (document) => `- ${document.ref}: ${document.title}`,
    ),
  ];

  if (input.notes.length > 0) {
    lines.push(
      '',
      "The developer's own notes are below. Each is something they told us that",
      'their documents do not say — an answer to a question we asked, or a',
      'correction. **A note outranks the documents.** Where a note contradicts a',
      'document, follow the note, and raise the discrepancy as a point so they',
      'know their documents are out of date.',
      '',
      'Notes:',
      ...input.notes.map((note, index) =>
        note.context
          ? `- n${index}: ${note.content}\n  (in reply to: ${note.context})`
          : `- n${index}: ${note.content}`,
      ),
    );
  }

  lines.push(
    '',
    'Write the document:',
    '- It is a synthesis, not a transcription. The developer already has the',
    '  documents; what they do not have is one account of what those documents',
    '  say together. Expect it to be several times shorter than its sources —',
    '  aim for around a tenth of their length, and never write more than they',
    '  hold. A document that reproduces its sources has done nothing.',
    '- Around six to twelve parts for a typical project, and a handful of',
    '  paragraphs in each. If you are writing more than that, you are copying',
    '  rather than deciding what matters.',
    '- Named parts, continuous prose under each, read top to bottom.',
    '- Group what belongs together, and order the parts so the document builds:',
    '  what the project is before how it works, and so on.',
    '- A paragraph draws several things together. Do not write one paragraph per',
    '  sentence of a document — that is the raw material, not a reference.',
    '- Each part names the documents it drew on, by their refs.',
    '- Say nothing the documents and notes do not support. Do not infer, do not',
    '  fill a gap with what is usually true of projects like this, and do not',
    '  smooth two sources that disagree into one that sounds settled.',
    '',
    'Raise a point for anything you could not settle:',
    '- Two documents that contradict each other.',
    '- Something implied but never stated, that a reader would need.',
    '- A note that contradicts a document.',
    'Each point says what it is, and why it matters to what the developer will',
    'rely on. Do not raise wording, style or completeness questions.',
    '',
    'Where a point leaves a hole in the text, write a "gap" passage in its place',
    'naming that point. A document that reads as if everything were settled is',
    'the one failure this product exists to prevent — the hole must be visible',
    'exactly where it applies.',
    '',
    'If one of the documents has nothing to do with this project — a file added',
    'by mistake — name it in unrelatedDocumentRefs and leave it out of the',
    'document entirely. Covering a subject the others do not is not the same as',
    'being unrelated: a new subject is expected. Do not name anything here when',
    'there is only one document, since there is nothing to compare it against.',
    '',
    'If the documents hold nothing a developer could use as a reference, set',
    'outcome to "nothing_usable" and return no parts. Saying so is useful;',
    'padding a document to look complete is not.',
  );

  return lines.join('\n');
}
