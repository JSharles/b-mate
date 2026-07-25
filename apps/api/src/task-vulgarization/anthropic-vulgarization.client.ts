import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { Locale } from './locale';
import {
  VulgarizationOutput,
  VulgarizationOutputSchema,
} from './vulgarization-output.schema';

// research.md Decision 1: a small, current Claude model is sufficient for
// this short, tightly-constrained rewrite — the per-call payload is tiny, so
// cost is not the deciding factor, reliability on a bounded task is. Trivial
// to swap to a larger model (one constant) if evaluation shows it's needed.
const MODEL = 'claude-haiku-4-5';

const TOOL_NAME = 'submit_vulgarization';

// FR-006: one call per app-supported locale — the model must be told
// explicitly which language to answer in, since the source ticket's own
// language (usually English) is otherwise the only signal it has.
const LANGUAGE_NAME: Record<Locale, string> = {
  en: 'English',
  fr: 'French',
};

// Encodes the guardrails discussed with the user: reword only, never
// fabricate, no added opinion/marketing, comparable-or-shorter length. See
// docs/PRODUCT.md Product Principles ("Never fabricate") and spec.md FR-002.
function systemPrompt(locale: Locale): string {
  return `You rewrite a software development task's title and description in plain, non-technical language for a client with no technical background.

Rules:
- Write your response in ${LANGUAGE_NAME[locale]}, regardless of what language the source is written in.
- Only rephrase what is given. Never invent facts, statuses, dates, or details that are not present in the source.
- Keep the result about the same length as the source, or shorter — never longer.
- Do not add opinions, reassurance, or marketing language that isn't present in the source.
- Respond only by calling the ${TOOL_NAME} tool with the rewritten title and description.`;
}

export interface VulgarizationInput {
  projectTitle: string;
  taskTitle: string;
  taskDescription: string | null;
  locale: Locale;
}

@Injectable()
export class AnthropicVulgarizationClient {
  private readonly client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async vulgarize(input: VulgarizationInput): Promise<VulgarizationOutput> {
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt(input.locale),
      tools: [
        {
          name: TOOL_NAME,
          description: 'Submit the plain-language rewrite of the task.',
          input_schema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: ['string', 'null'] },
            },
            required: ['title', 'description'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: `Project: ${input.projectTitle}\n\nTask title: ${input.taskTitle}\n\nTask description: ${input.taskDescription ?? '(none)'}`,
        },
      ],
    });

    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (!toolUseBlock) {
      throw new Error('Anthropic response did not include a tool_use block');
    }

    // Defense in depth (Constitution II): the API's input_schema already
    // constrains the model's output, but this is still a third-party
    // boundary — narrow it explicitly rather than trusting the shape.
    return VulgarizationOutputSchema.parse(toolUseBlock.input);
  }
}
