import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import mammoth from 'mammoth';
import {
  ClientContentOutputSchema,
  ReferenceCategoryUpdate,
  ReferenceQuestionOutput,
  ReferenceRebuildOutputSchema,
  ReferenceUpdateOutputSchema,
} from './reference-output.schema';
import {
  RESOURCE_CATEGORIES,
  ResourceCategoryKey,
} from './resource-categories';

// A whole document, potentially with diagrams, whose every fact must survive
// — a heavier task than short rewrites, so a stronger tier by default, kept
// configurable so cost/quality can be retuned without a code change.
const DEFAULT_MODEL = 'claude-sonnet-5';

const TOOL_NAME = 'submit_reference_update';
const REBUILD_TOOL_NAME = 'submit_reference_rebuild';
const INGESTION_CUSTOM_ID = 'reference';
const REBUILD_CUSTOM_ID = 'rebuild';
const DERIVE_TOOL_NAME = 'submit_client_content';
const DERIVE_CUSTOM_ID = 'derive';

// The output can carry, for up to four categories, both an extract and a full
// merged body — and the merged body grows with the corpus. The Batch API has
// no HTTP timeout to worry about, so the ceiling is set well clear of what a
// realistic project needs rather than tuned tightly. Truncation degrades
// safely: the tool call fails validation and the document ends `failed`.
const MAX_TOKENS = 32000;

// Whole-document/vision for pdf/image — the provider reads a PDF's text and
// renders its pages as images in the same call, so diagrams are described.
// docx gets text plus any extractable embedded images via mammoth instead (no
// native page-vision equivalent for that format). text is a Notion page's
// flattened content.
//
// An `image` source has already been through ImageNormalizer by the time it
// reaches here — the provider rejects anything over 8000 px on its long edge,
// per-request at execution time (specs/014 research.md Decision 6).
export type DocumentSource =
  | { kind: 'pdf'; fileBuffer: Buffer }
  | { kind: 'image'; fileBuffer: Buffer; mimeType: 'image/png' | 'image/jpeg' }
  | { kind: 'docx'; fileBuffer: Buffer }
  | { kind: 'text'; text: string };

// The reference layer as it stands when a document arrives. Categories with no
// content yet are simply absent.
export type ExistingReference = Partial<Record<ResourceCategoryKey, string>>;

// A question the contributor has answered, carried into the next rebuild so
// the point is settled in the text instead of staying open.
export interface AnsweredQuestion {
  question: string;
  answer: string;
}

export type RebuildPollResult =
  | { status: 'pending' }
  | {
      status: 'succeeded';
      reference: string;
      questions: ReferenceQuestionOutput[];
    }
  | { status: 'failed'; reason: string };

export type DerivationPollResult =
  | { status: 'pending' }
  | { status: 'succeeded'; contentEn: string; contentFr: string }
  | { status: 'failed'; reason: string };

export type IngestionPollResult =
  | { status: 'pending' }
  | { status: 'succeeded'; categories: ReferenceCategoryUpdate[] }
  | { status: 'failed'; reason: string };

// FR-022's cap. Enforced in the prompt AND again on the way out: a model that
// returns six is not a reason to fail a document, but the sixth must not reach
// a contributor either.
const MAX_QUESTIONS = 5;

// specs/015 FR-021 to FR-023. The bar is deliberately high: a question is worth
// a contributor's attention only when the answer changes what their client
// ends up reading. Asking about style, or for completeness' own sake, turns the
// one human gate into a chore and gets it clicked through.
//
// The marker is what makes skipping safe (FR-023). It is written at the same
// time as the question, so an unanswered question leaves the point visibly
// open in the text rather than silently arbitrated — no second pass needed,
// and nothing to do if the contributor simply accepts as is.
const QUESTIONS_SCHEMA = {
  type: 'array',
  description:
    'Up to five questions for the developer, only where the answer would change what their client is told. Omit entirely when there is nothing worth asking — which is the normal case. rank 1 is the most consequential.',
  items: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      rank: { type: 'integer' },
    },
    required: ['question', 'rank'],
  },
} as const;

const QUESTION_RULES = `Questions (optional, and usually unnecessary):
- You may ask the developer up to ${MAX_QUESTIONS} questions per category, only when the answer would change what their client is eventually told: a genuine ambiguity, a contradiction between sources you cannot resolve, or a gap that leaves the client's picture wrong.
- Never ask about wording, structure or style, and never ask for more detail for its own sake. If the documentation reads fine without the answer, do not ask.
- Rank them: rank 1 is the question whose answer would change the most. Ask nothing rather than pad the list.
- For every question you ask, ALSO mark the corresponding point inside the reference text as \`[to clarify: ...]\`, in the language of the surrounding text. The developer may never answer, and the text must show the point is open rather than settle it silently.`;

// specs/015 FR-002/FR-003. Two things fight in this prompt and the resolution
// has to be explicit, because a model given "produce a clean, structured
// document" will compress — and this is the one layer where compression is
// unrecoverable, since the raw sources are never read again afterwards.
//
// FR-004 is the other half: merge into what exists rather than appending. 014
// appended, and that is precisely why a client ended up reconciling several
// blocks about the same thing.
function ingestionSystemPrompt(existing: ExistingReference): string {
  const categoryList = RESOURCE_CATEGORIES.map(
    (category) => `- ${category.key}: ${category.holds}`,
  ).join('\n');

  const existingBlocks = RESOURCE_CATEGORIES.filter(
    (category) => existing[category.key],
  )
    .map(
      (category) => `### ${category.key}\n${existing[category.key] as string}`,
    )
    .join('\n\n');

  const existingSection =
    existingBlocks.length > 0
      ? `Here is the reference documentation as it stands today. Your job is to produce its next version, not a second document alongside it:\n\n${existingBlocks}`
      : 'There is no reference documentation for this project yet — this is the first document.';

  return `You maintain the reference documentation for a software project, from the documents its developer feeds you: notes, briefs, meeting minutes, architecture diagrams, exported pages. The result is the developer's own working document — organised and professional. It is NOT written for their client and must NOT be simplified or popularised; a separate step does that later.

The documentation is organised under these fixed categories:

${categoryList}

${existingSection}

How to write:
- Clean in FORM: no repetition, no padding, each piece of information stated once, organised so it can be read in order. Use headings inside a category when it genuinely helps.
- Exhaustive in SUBSTANCE: every fact, figure, date, name, decision, constraint and open point present in the source must be present in your output.
- **Where those two pull against each other, exhaustiveness wins.** Never drop information to make the text tidier or shorter. This is the last time these source documents will be read: anything you leave out is lost for good.

How to merge:
- Integrate the new document into the existing text. Do not append it as a separate block, and do not restate what is already there.
- When the new document revises something — a date moved, a decision reversed, a figure corrected — the output states the current version, not both side by side.
- When it contradicts something and you cannot tell which is right, keep both and say plainly that the sources disagree. Never pick one silently.
- Everything already in the existing reference stays, unless the new document explicitly supersedes it.

Rules:
- Produce an entry only for a category this document genuinely says something about. Never invent or pad to fill a category. A document touching two categories produces two entries.
- Never invent facts, figures, dates or names that are not in the sources.
- Describe any diagram, chart or schema in words — what it shows and what it means. Never skip visual content.
- For every category you produce, return BOTH: \`extract\`, containing only what THIS new document contributes to that category, and \`reference\`, the full merged body for that category.
- Respond only by calling the ${TOOL_NAME} tool.

${QUESTION_RULES}`;
}

// The same no-loss guarantee as ingestion, applied to a re-merge. The sources
// here are the extracts of the documents that remain — so a document that was
// deleted simply is not among them, which is what makes deletion behave "as if
// it had never been added" (FR-019) without asking a model to unmix prose.
function rebuildSystemPrompt(
  categoryKey: ResourceCategoryKey,
  instruction: string | null,
  answers: AnsweredQuestion[],
): string {
  const category = RESOURCE_CATEGORIES.find((c) => c.key === categoryKey);
  const instructionSection = instruction
    ? `\n\nThe developer reviewed the previous version and asked for this change. Apply it, and change nothing else:\n\n"${instruction}"`
    : '';

  // FR-023 from the other side: an answered point stops being open, so its
  // marker must go. Saying so explicitly matters — the marker is in the source
  // text being rewritten, and would otherwise survive its own resolution.
  const answerSection =
    answers.length > 0
      ? `\n\nThe developer answered these open points. Fold each answer into the text as settled fact and remove its "[to clarify: ...]" marker:\n\n${answers
          .map((entry) => `Q: ${entry.question}\nA: ${entry.answer}`)
          .join('\n\n')}`
      : '';

  return `You maintain the reference documentation for a software project. Rewrite one category's documentation from the source material below, which is everything the project's documents say about it.

This category covers: ${category?.holds ?? categoryKey}

The result is the developer's own working document — organised and professional. It is NOT written for their client and must NOT be simplified or popularised.

How to write:
- Clean in FORM: no repetition, no padding, each piece of information stated once, organised so it can be read in order.
- Exhaustive in SUBSTANCE: every fact, figure, date, name, decision, constraint and open point present in the sources must appear in your output.
- **Where those two pull against each other, exhaustiveness wins.** Never drop information to make the text tidier.
- Where two sources disagree, keep both and say plainly that they disagree. Never pick one silently.
- Never invent anything absent from the sources.${instructionSection}${answerSection}

Respond only by calling the ${REBUILD_TOOL_NAME} tool.

${QUESTION_RULES}`;
}

// The only place in the system that vulgarizes. Its input is reference content
// a contributor has already validated, so the facts are settled: this step
// only changes who the text is written for.
function derivationSystemPrompt(categoryKey: ResourceCategoryKey): string {
  const category = RESOURCE_CATEGORIES.find((c) => c.key === categoryKey);

  return `You rewrite one section of a software project's documentation for the client who commissioned it. They are not technical and did not write any of this.

This section covers: ${category?.holds ?? categoryKey}

Vulgarizing means rewriting in plain, everyday language — it is not summarizing. Keep what matters: decisions, dates, figures, what was built and why. A thorough source deserves a proportionally thorough rewrite, not a short summary that drops detail to stay brief.

Write it as one continuous, readable text — instructive and light. The reader should never be able to tell how many documents it came from, and should never have to reconcile two passages saying the same thing.

Rules:
- Avoid jargon. Where a technical term is unavoidable, say briefly what it means.
- Describe what diagrams and schemas show, in words.
- Never invent anything absent from the source.
- Where the source says two sources disagree on something, say so plainly rather than choosing.
- Produce the text twice: contentEn in English, contentFr in French, carrying the same substance.
- Respond only by calling the ${DERIVE_TOOL_NAME} tool.`;
}

// Deliberately no orchestration framework: an explicit wrapper over the SDK.
// The pipeline is linear with one human gate, and its state lives in Postgres
// with a cron sweep driving it — durable and inspectable, which an in-process
// graph would not be (research.md, plan.md § Constitution Check).
@Injectable()
export class ReferenceAnalysisClient {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  // One request per ingested document (research.md Decision 2). Chaining
  // classify-then-merge would cost a full sweep cycle per link, turning one
  // wait into two for no gain in quality.
  async submitIngestion(
    source: DocumentSource,
    title: string,
    existing: ExistingReference,
  ): Promise<string> {
    const content = await this.buildContent(source, title);
    const model = process.env.RESOURCE_VULGARIZATION_MODEL || DEFAULT_MODEL;

    const batch = await this.client.messages.batches.create({
      requests: [
        {
          custom_id: INGESTION_CUSTOM_ID,
          params: {
            model,
            max_tokens: MAX_TOKENS,
            system: ingestionSystemPrompt(existing),
            tools: [
              {
                name: TOOL_NAME,
                description:
                  "Submit the next version of the project's reference documentation, per category.",
                input_schema: {
                  type: 'object',
                  properties: {
                    categories: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          categoryKey: {
                            type: 'string',
                            enum: RESOURCE_CATEGORIES.map((c) => c.key),
                          },
                          extract: { type: 'string' },
                          reference: { type: 'string' },
                          questions: QUESTIONS_SCHEMA,
                        },
                        required: ['categoryKey', 'extract', 'reference'],
                      },
                    },
                  },
                  required: ['categories'],
                },
              },
            ],
            tool_choice: { type: 'tool', name: TOOL_NAME },
            messages: [{ role: 'user', content }],
          },
        },
      ],
    });

    return batch.id;
  }

  // "pending" while the batch runs. Anything that is not a clean, non-empty
  // parse ends the document as `failed` with a readable reason — a category's
  // existing live content is never touched by a failure (spec Edge Cases).
  async pollIngestion(batchId: string): Promise<IngestionPollResult> {
    const batch = await this.client.messages.batches.retrieve(batchId);
    if (batch.processing_status !== 'ended') {
      return { status: 'pending' };
    }

    const results = await this.client.messages.batches.results(batchId);
    for await (const item of results) {
      if (item.result.type !== 'succeeded') {
        return { status: 'failed', reason: describeResultError(item.result) };
      }

      // A malformed or truncated tool call must end this document as failed,
      // not throw: the caller only catches exceptions to log-and-retry, which
      // would leave the document stuck in `pending` forever, re-polling an
      // already-ended batch on every sweep.
      try {
        const categories = this.parseCategories(item.result.message);
        if (categories.length === 0) {
          return {
            status: 'failed',
            reason:
              'This document did not contribute anything to the project documentation.',
          };
        }
        return { status: 'succeeded', categories };
      } catch (error) {
        return {
          status: 'failed',
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return { status: 'failed', reason: 'incomplete batch results' };
  }

  // Used by two paths that are the same operation underneath: deleting a
  // document (rebuild from what survives) and asking for a correction
  // (rebuild, steered by an instruction). Neither contributes new material,
  // which is why there is no extract in the output.
  async submitRebuild(
    categoryKey: ResourceCategoryKey,
    extracts: string[],
    instruction: string | null,
    answers: AnsweredQuestion[] = [],
  ): Promise<string> {
    const model = process.env.RESOURCE_VULGARIZATION_MODEL || DEFAULT_MODEL;

    const batch = await this.client.messages.batches.create({
      requests: [
        {
          custom_id: REBUILD_CUSTOM_ID,
          params: {
            model,
            max_tokens: MAX_TOKENS,
            system: rebuildSystemPrompt(categoryKey, instruction, answers),
            tools: [
              {
                name: REBUILD_TOOL_NAME,
                description:
                  'Submit the rebuilt reference documentation for this category.',
                input_schema: {
                  type: 'object',
                  properties: {
                    reference: { type: 'string' },
                    questions: QUESTIONS_SCHEMA,
                  },
                  required: ['reference'],
                },
              },
            ],
            tool_choice: { type: 'tool', name: REBUILD_TOOL_NAME },
            messages: [
              {
                role: 'user',
                content: extracts
                  .map(
                    (extract, index) => `## Source ${index + 1}\n\n${extract}`,
                  )
                  .join('\n\n'),
              },
            ],
          },
        },
      ],
    });

    return batch.id;
  }

  async pollRebuild(batchId: string): Promise<RebuildPollResult> {
    const batch = await this.client.messages.batches.retrieve(batchId);
    if (batch.processing_status !== 'ended') {
      return { status: 'pending' };
    }

    const results = await this.client.messages.batches.results(batchId);
    for await (const item of results) {
      if (item.result.type !== 'succeeded') {
        return { status: 'failed', reason: describeResultError(item.result) };
      }
      try {
        const toolUseBlock = item.result.message.content.find(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
        );
        if (!toolUseBlock) {
          throw new Error(
            'Anthropic response did not include a tool_use block',
          );
        }
        const { reference, questions } = ReferenceRebuildOutputSchema.parse(
          toolUseBlock.input,
        );
        return {
          status: 'succeeded',
          reference,
          questions: rankAndCap(questions),
        };
      } catch (error) {
        return {
          status: 'failed',
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return { status: 'failed', reason: 'incomplete batch results' };
  }

  // FR-010 holds by construction here: validated reference content is the
  // only content input, so a client text is never rewritten from a previous
  // client text — which is what stops detail eroding across ingestions.
  async submitDerivation(
    categoryKey: ResourceCategoryKey,
    reference: string,
  ): Promise<string> {
    const model = process.env.RESOURCE_VULGARIZATION_MODEL || DEFAULT_MODEL;

    const batch = await this.client.messages.batches.create({
      requests: [
        {
          custom_id: DERIVE_CUSTOM_ID,
          params: {
            model,
            max_tokens: MAX_TOKENS,
            system: derivationSystemPrompt(categoryKey),
            tools: [
              {
                name: DERIVE_TOOL_NAME,
                description:
                  'Submit the plain-language version a client reads, in both languages.',
                input_schema: {
                  type: 'object',
                  properties: {
                    contentEn: { type: 'string' },
                    contentFr: { type: 'string' },
                  },
                  required: ['contentEn', 'contentFr'],
                },
              },
            ],
            tool_choice: { type: 'tool', name: DERIVE_TOOL_NAME },
            messages: [{ role: 'user', content: reference }],
          },
        },
      ],
    });

    return batch.id;
  }

  async pollDerivation(batchId: string): Promise<DerivationPollResult> {
    const batch = await this.client.messages.batches.retrieve(batchId);
    if (batch.processing_status !== 'ended') {
      return { status: 'pending' };
    }

    const results = await this.client.messages.batches.results(batchId);
    for await (const item of results) {
      if (item.result.type !== 'succeeded') {
        return { status: 'failed', reason: describeResultError(item.result) };
      }
      try {
        const toolUseBlock = item.result.message.content.find(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
        );
        if (!toolUseBlock) {
          throw new Error(
            'Anthropic response did not include a tool_use block',
          );
        }
        const parsed = ClientContentOutputSchema.parse(toolUseBlock.input);
        return { status: 'succeeded', ...parsed };
      } catch (error) {
        return {
          status: 'failed',
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return { status: 'failed', reason: 'incomplete batch results' };
  }

  private parseCategories(
    message: Anthropic.Message,
  ): ReferenceCategoryUpdate[] {
    const toolUseBlock = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (!toolUseBlock) {
      throw new Error('Anthropic response did not include a tool_use block');
    }

    const { categories } = ReferenceUpdateOutputSchema.parse(
      toolUseBlock.input,
    );
    return mergeByCategory(categories).map((category) => ({
      ...category,
      questions: rankAndCap(category.questions),
    }));
  }

  private async buildContent(
    source: DocumentSource,
    title: string,
  ): Promise<Anthropic.ContentBlockParam[]> {
    switch (source.kind) {
      case 'pdf':
        return [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: source.fileBuffer.toString('base64'),
            },
            title,
          },
        ];
      case 'image':
        return [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: source.mimeType,
              data: source.fileBuffer.toString('base64'),
            },
          },
        ];
      case 'docx':
        return this.buildDocxContent(source.fileBuffer);
      case 'text':
        return [{ type: 'text', text: source.text }];
    }
  }

  // No native page-vision equivalent for .docx — extract text and any embedded
  // images separately instead. A diagram embedded in a .docx may describe less
  // richly than the same diagram in a PDF (no page layout or context): a
  // disclosed, accepted asymmetry carried over from specs/011.
  private async buildDocxContent(
    fileBuffer: Buffer,
  ): Promise<Anthropic.ContentBlockParam[]> {
    const images: Array<{ data: string; mimeType: string }> = [];
    await mammoth.convertToHtml(
      { buffer: fileBuffer },
      {
        convertImage: mammoth.images.imgElement(async (image) => {
          const data = await image.read('base64');
          images.push({ data, mimeType: image.contentType });
          // The resulting HTML is discarded — only the side-collected `images`
          // array is used. `src` is required by mammoth's type, never read.
          return { src: '' };
        }),
      },
    );
    const { value: text } = await mammoth.extractRawText({
      buffer: fileBuffer,
    });

    const content: Anthropic.ContentBlockParam[] = [{ type: 'text', text }];
    for (const image of images) {
      if (isSupportedImageMimeType(image.mimeType)) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: image.mimeType,
            data: image.data,
          },
        });
      }
    }
    return content;
  }
}

// FR-022 enforced where it actually binds. The prompt asks for five ranked
// questions; this is what guarantees a contributor never sees a sixth, and
// never sees them out of order, whatever the model returns.
function rankAndCap(
  questions: ReferenceQuestionOutput[] | undefined,
): ReferenceQuestionOutput[] {
  if (!questions) {
    return [];
  }
  return [...questions].sort((a, b) => a.rank - b.rank).slice(0, MAX_QUESTIONS);
}

// FR-010's one-body-per-category is enforced by a unique constraint in the
// database. A model that splits one category's material across two entries is
// producing a formatting quirk, not an error worth failing a whole document
// over — so the entries are concatenated in arrival order rather than
// colliding on that constraint.
function mergeByCategory(
  categories: ReferenceCategoryUpdate[],
): ReferenceCategoryUpdate[] {
  const merged = new Map<string, ReferenceCategoryUpdate>();

  for (const category of categories) {
    const existing = merged.get(category.categoryKey);
    if (!existing) {
      merged.set(category.categoryKey, category);
      continue;
    }
    merged.set(category.categoryKey, {
      ...existing,
      extract: `${existing.extract}\n\n${category.extract}`,
      reference: `${existing.reference}\n\n${category.reference}`,
    });
  }

  return Array.from(merged.values());
}

// `errored` results carry the provider's actual error type and message, which
// is what names a problem like an oversized image immediately instead of
// leaving it to be found by querying the API by hand (specs/014 taught this).
// `canceled`/`expired` have no further detail.
function describeResultError(
  result: Anthropic.Messages.MessageBatchResult,
): string {
  if (result.type === 'errored') {
    return `${result.error.error.type}: ${result.error.error.message}`;
  }
  return result.type;
}

function isSupportedImageMimeType(
  mimeType: string,
): mimeType is 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(
    mimeType,
  );
}
