import type {
  DocumentationCategoryKey,
  InformationItemKind,
  InformationItemState,
} from '@prisma/client';
import { FACTUAL_DRAFT_PROMPT_VERSION } from '../factual-draft-output.schema';

export interface FactualDraftPromptItem {
  id: string;
  kind: InformationItemKind;
  state: InformationItemState;
  content: string;
}

export function buildFactualDraftPrompt(input: {
  categoryKey: DocumentationCategoryKey;
  sourceRevisionId: string;
  items: readonly FactualDraftPromptItem[];
  correctionInstruction?: string | null;
}): string {
  const prompt = [
    `Prompt version: ${FACTUAL_DRAFT_PROMPT_VERSION}`,
    `Category: ${input.categoryKey}`,
    `Source revision: ${input.sourceRevisionId}`,
    'Produce a factual reference. Do not change tone, shorten for style, infer, or invent.',
    'Cover every item exactly through informationItemIds. Preserve point_to_clarify as open_point with its stable item id.',
    'Write the draft in English, like the canonical source it is built from.',
  ];
  if (input.correctionInstruction) {
    prompt.push(
      'Apply the contributor correction below only when it changes factual accuracy, structure, completeness, or clarity without changing editorial tone or level of detail.',
      `Contributor correction: ${input.correctionInstruction}`,
    );
  }
  prompt.push(JSON.stringify(input.items));
  return prompt.join('\n');
}
