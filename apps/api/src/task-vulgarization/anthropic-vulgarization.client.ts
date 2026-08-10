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
//
// 2026-08-10: the original wording ("leave null unless the source
// explicitly says so") was conservative enough in practice that real tasks
// often left why/impact/status null even when a genuine, defensible answer
// was inferable — every task now shows a consistent why/impact/état
// structure client-side (with a "not provided" placeholder for true gaps),
// so a null field is no longer just invisible, it visibly reads as missing
// information. Reworded per section to explicitly allow reasonable
// inference from what the task itself evidently is (its type, label, or
// content) — still never inventing a specific, unsupported claim.
function systemPrompt(locale: Locale): string {
  return `You vulgarize a software development task for a client with no technical background — someone who has never written code and doesn't know what terms like "API", "race condition", "database", or "refactor" mean.

Vulgarizing is not the same as rephrasing. Swapping a technical term for a slightly simpler synonym is not enough — explain the real-world purpose or consequence of the work in plain terms a non-technical person immediately understands, the way a developer would explain it out loud to a friend outside the industry. For example, given a source about "a race condition in optimistic locking causing lost updates on task reassignment," do not write "a timing problem when saving changes" — that is still jargon in disguise. Instead write something like "when two people try to update the same thing at the same time, one person's change could silently get lost — we're fixing that so it can't happen anymore."

Break your answer into four parts. Each must be grounded in the source — but "grounded" means a genuine, reasonable reading of it, not a requirement that it spell every detail out in so many words:
- title: what the task is, in one short sentence. Always required.
- why: why this work is necessary — the real problem or risk it addresses. Infer this from what the task itself evidently is, not only from an explicit motivation statement: a bug report implies something is currently broken, a feature request implies a gap in what's possible today, a security-labeled task implies a risk being closed. Leave this null only when you genuinely cannot infer anything truthful about the motivation — not merely because the source doesn't spell it out in a sentence.
- impact: what changes for the client, day to day. For work that's clearly internal or technical (refactors, infrastructure, dependency updates, test coverage, performance work) with nothing suggesting a user-facing change, "nothing changes in your day-to-day use" is a safe, honest default — say so. For anything that touches what a user sees or does, describe the concrete change, but only when the source actually supports that specific claim. Leave this null only when you genuinely cannot tell either way.
- status: the current state of the work in plain language, beyond just "it's being worked on" (e.g. a first version exists and is being reviewed). Look for real signals already in the source — completed checklist items, sub-tasks marked done, comments describing what's finished versus what's left — these count as genuine evidence, not only an explicit progress narrative. Leave this null only when the source truly gives no signal of progress, not merely because nothing narrates it directly.

Rules:
- Write your response in ${LANGUAGE_NAME[locale]}, regardless of what language the source is written in.
- Never invent facts, statuses, dates, priorities, or details that have no basis in the source. Vulgarizing changes HOW something is explained, never WHAT is being described. A reasonable inference from what the task genuinely is (its type, label, or content) is not fabrication; a specific claim with no basis in the source is. When you truly cannot say anything truthful, leave the section null — never fill the gap with an unsupported guess.
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
