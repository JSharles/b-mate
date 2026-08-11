import { DOCUMENTATION_CATEGORY_KEYS } from '../../documentation-categories';
import { DOCUMENT_EXTRACTION_PROMPT_VERSION } from '../extraction-output.schema';

export { DOCUMENT_EXTRACTION_PROMPT_VERSION };

export const DOCUMENT_EXTRACTION_OUTPUT_CONTRACT =
  'diaphane.document-extraction.v1';

export function buildDocumentExtractionPrompt(input: {
  inputFingerprint: string;
  inputChunkCount: number;
}): string {
  return [
    `Prompt version: ${DOCUMENT_EXTRACTION_PROMPT_VERSION}`,
    `Input fingerprint: ${input.inputFingerprint}`,
    `Input chunk count: ${input.inputChunkCount}`,
    `Allowed categories: ${DOCUMENTATION_CATEGORY_KEYS.join(', ')}`,
    '',
    'Extract only material, atomic information explicitly supported by the supplied document.',
    'Never infer, complete, reconcile, or invent missing facts.',
    'Keep an exact original excerpt and a precise source locator for every observation.',
    'Write normalizedContent in English, whatever language the document is in; never alter originalExcerpt.',
    'Use a unique zero-based sequence for every observation.',
    'Report outputObservationCount exactly; count discarded non-claims in rejectedClaimCount.',
    'Return only data matching the requested structured output contract.',
  ].join('\n');
}
