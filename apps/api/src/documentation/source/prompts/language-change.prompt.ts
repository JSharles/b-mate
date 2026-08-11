export const SOURCE_LANGUAGE_CHANGE_PROMPT_VERSION =
  'source-language-change-v1';
export const SOURCE_LANGUAGE_CHANGE_OUTPUT_CONTRACT =
  'diaphane.source-language-change.v1';

export function buildSourceLanguageChangePrompt(input: {
  fromLanguage: string;
  toLanguage: string;
  inputFingerprint: string;
  itemCount: number;
}): string {
  return [
    `Prompt version: ${SOURCE_LANGUAGE_CHANGE_PROMPT_VERSION}`,
    `Input fingerprint: ${input.inputFingerprint}`,
    `Source language: ${input.fromLanguage}`,
    `Target language: ${input.toLanguage}`,
    `Item count: ${input.itemCount}`,
    '',
    'Translate every supplied canonical item faithfully into the target language.',
    'Preserve factual meaning, identifiers, figures, dates, names, ambiguity, and open-point status.',
    'Do not add, remove, reconcile, summarize, or editorialize information.',
    'Return exactly one translatedContent value for every supplied informationItemId.',
  ].join('\n');
}
