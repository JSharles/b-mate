import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { Locale } from './locale';
import {
  TaskEstimateOutput,
  TaskEstimateOutputSchema,
} from './task-estimate-output.schema';
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
const ESTIMATE_TOOL_NAME = 'submit_task_estimate';

// FR-006: one call per app-supported locale — the model must be told
// explicitly which language to answer in, since the source ticket's own
// language (usually English) is otherwise the only signal it has.
const LANGUAGE_NAME: Record<Locale, string> = {
  en: 'English',
  fr: 'French',
};

// Encodes the guardrails discussed with the user: genuine vulgarization (not
// word-swapping), never fabricate, no added opinion/marketing, always short
// regardless of source length. See docs/PRODUCT.md Product Principles
// ("Never fabricate") and spec.md FR-002.
//
// 2026-08-09: restructured from one title+description pair into four named
// sections (docs/PRODUCT.md "Working notes") — a client scans "what/why/
// impact/status" far faster than one paragraph, provided each section is
// only ever filled when the source genuinely supports it (never a plausible
// guess to avoid an empty-looking card).
function systemPrompt(locale: Locale): string {
  return `You vulgarize a software development task for a client with no technical background — someone who has never written code and doesn't know what terms like "API", "race condition", "database", or "refactor" mean.

Vulgarizing is not the same as rephrasing. Swapping a technical term for a slightly simpler synonym is not enough — explain the real-world purpose or consequence of the work in plain terms a non-technical person immediately understands, the way a developer would explain it out loud to a friend outside the industry. For example, given a source about "a race condition in optimistic locking causing lost updates on task reassignment," do not write "a timing problem when saving changes" — that is still jargon in disguise. Instead write something like "when two people try to update the same thing at the same time, one person's change could silently get lost — we're fixing that so it can't happen anymore."

Break your answer into four parts, each based only on what the source actually contains:
- title: what the task is, in one short sentence. Always required.
- why: why this work is necessary — the real problem or risk it addresses. Leave this null if the source gives you nothing genuine to say about motivation.
- impact: what changes for the client, day to day — this is often "nothing visible" for internal/technical work, but only say so, or describe a concrete change, when the source actually supports that specific claim. Leave this null if you cannot say anything truthful either way.
- status: the current state of the work in plain language, beyond just "it's being worked on" (e.g. a first version exists and is being reviewed). Leave this null unless the source actually describes progress like that.

Rules:
- Write your response in ${LANGUAGE_NAME[locale]}, regardless of what language the source is written in.
- Never invent facts, statuses, dates, priorities, or details that are not present in the source. Vulgarizing changes HOW something is explained, never WHAT is being described. When the source doesn't support a section, leave it null — never fill the gap with a plausible-sounding guess.
- Keep every section short, no matter how long or technical the source is: one short sentence for the title, at most one or two short sentences for each other section. Summarize down to the essence — do not paraphrase line by line.
- Do not add opinions, reassurance, or marketing language that isn't present in the source.
- Respond only by calling the ${TOOL_NAME} tool.`;
}

export interface VulgarizationInput {
  projectTitle: string;
  taskTitle: string;
  taskDescription: string | null;
  locale: Locale;
}

// specs/008-current-task-progress research.md Decision 2/3: a separate call
// from vulgarize() — this judgment is locale-independent (asked once per
// item, not once per locale, research.md Decision 1) and must never receive
// or return an absolute date, only a duration, to avoid LLM date-arithmetic
// errors (the caller computes the real date from the task's own start date).
const ESTIMATE_SYSTEM_PROMPT = `You judge how long a software development task will likely take and how complex it is, based only on its own title and description — no external context about the team, their velocity, or their calendar.

Rules:
- Estimate a duration in whole days, not an absolute date — you have no reliable way to know today's date, so never attempt calendar arithmetic yourself.
- Judge complexity as either "simple" (a small, well-scoped, low-risk change) or "complex" (touches multiple systems, has unclear scope, carries real risk of hidden work) — based only on what the task's own content actually describes, not a guess about the codebase you cannot see.
- Base both judgments only on the task's own title/description. Do not assume information that isn't there.
- Respond only by calling the ${ESTIMATE_TOOL_NAME} tool with your duration estimate and complexity judgment.`;

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
          description:
            'Submit the plain-language rewrite of the task, broken into sections.',
          input_schema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              why: { type: ['string', 'null'] },
              impact: { type: ['string', 'null'] },
              status: { type: ['string', 'null'] },
            },
            required: ['title', 'why', 'impact', 'status'],
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

    return VulgarizationOutputSchema.parse(this.extractToolInput(response));
  }

  // Task title/description only — never the project title, which has no
  // bearing on how long a task takes or how complex it is.
  async estimateTask(input: {
    taskTitle: string;
    taskDescription: string | null;
  }): Promise<TaskEstimateOutput> {
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: ESTIMATE_SYSTEM_PROMPT,
      tools: [
        {
          name: ESTIMATE_TOOL_NAME,
          description:
            "Submit the task's estimated duration (in days) and complexity judgment.",
          input_schema: {
            type: 'object',
            properties: {
              estimatedDurationDays: { type: 'number' },
              complexity: { type: 'string', enum: ['simple', 'complex'] },
            },
            required: ['estimatedDurationDays', 'complexity'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: ESTIMATE_TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: `Task title: ${input.taskTitle}\n\nTask description: ${input.taskDescription ?? '(none)'}`,
        },
      ],
    });

    return TaskEstimateOutputSchema.parse(this.extractToolInput(response));
  }

  private extractToolInput(response: Anthropic.Message): unknown {
    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (!toolUseBlock) {
      throw new Error('Anthropic response did not include a tool_use block');
    }

    // Defense in depth (Constitution II): the API's input_schema already
    // constrains the model's output, but this is still a third-party
    // boundary — narrow it explicitly rather than trusting the shape.
    return toolUseBlock.input;
  }
}
