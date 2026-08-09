import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import mammoth from 'mammoth';
import { Locale, SUPPORTED_LOCALES } from '../task-vulgarization/locale';
import {
  CategoryDetectionOutputSchema,
  CategoryProposal,
  DocumentVulgarizationOutput,
  DocumentVulgarizationOutputSchema,
} from './document-vulgarization-output.schema';

// research.md Decision 3: a heavier task than task-vulgarization's short
// rewrites (a whole document, potentially with diagrams, must keep its
// important information) — defaults to a stronger tier, but stays
// configurable so cost/quality can be retuned without a code change.
const DEFAULT_MODEL = 'claude-sonnet-5';

const TOOL_NAME = 'submit_vulgarized_document';

// specs/013-ai-resource-categorization research.md Decision 1: a third,
// locale-agnostic batch request alongside the two per-locale vulgarization
// requests — category detection doesn't depend on the reader's language,
// only its display labels do (both are produced together, see
// CategoryDetectionOutputSchema).
const CATEGORY_CUSTOM_ID = 'categories';
const CATEGORY_TOOL_NAME = 'submit_categories';

const LANGUAGE_NAME: Record<Locale, string> = {
  en: 'English',
  fr: 'French',
};

// Whole-document/vision for pdf/image (research.md Decision 1) — Claude
// reads the PDF's text and renders its pages as images in the same call, so
// diagrams/schemas are described. docx gets text (+ any extractable
// embedded images) via mammoth instead (Decision 2 — no native page-vision
// equivalent for that format). text is for a Notion-sourced resource's
// flattened page content (Decision 5), or a pre-extracted docx fallback.
export type DocumentVulgarizationSource =
  | { kind: 'pdf'; fileBuffer: Buffer }
  | { kind: 'image'; fileBuffer: Buffer; mimeType: 'image/png' | 'image/jpeg' }
  | { kind: 'docx'; fileBuffer: Buffer }
  | { kind: 'text'; text: string };

export interface LocaleVulgarization {
  locale: Locale;
  title: string;
  content: string;
}

// The project's already-approved/proposed categories, passed in so the
// category-detection prompt can reuse an existing key instead of minting a
// near-duplicate (research.md Decision 2). `labelEn` only — the prompt
// itself is English, the model produces both locales' labels regardless.
export interface ExistingCategory {
  key: string;
  labelEn: string;
}

export type BatchPollResult =
  | { status: 'pending' }
  | {
      status: 'succeeded';
      vulgarizations: LocaleVulgarization[];
      categories: CategoryProposal[];
    }
  | { status: 'failed'; reason: string };

// Encodes the guardrails discussed with the user: genuine vulgarization
// (never a short summary), diagrams/images described not skipped, never
// fabricate. See spec.md FR-003.
function systemPrompt(locale: Locale): string {
  return `You vulgarize a document for a client with no technical or subject-matter background.

Vulgarizing means rewriting in plain, everyday language — it is not the same as summarizing. Preserve every piece of information that matters in the source: facts, figures, decisions, requirements, dates, names. A long document should produce a proportionally thorough plain-language rewrite, not a short summary that drops detail to stay brief.

If the source contains a diagram, chart, schema, or any other visual content, describe in plain language what it shows and what it means, as part of the rewrite — never skip or silently ignore visual content.

Rules:
- Write your response in ${LANGUAGE_NAME[locale]}, regardless of what language the source is written in.
- Never invent facts, figures, dates, or details that are not present in the source.
- Avoid jargon; when a technical term is unavoidable, briefly explain what it means in context.
- Respond only by calling the ${TOOL_NAME} tool with a short descriptive title and the full rewritten content.`;
}

// specs/013-ai-resource-categorization: "type of information," not
// technical subject matter (spec.md FR-001) — the distinction the prompt
// exists to enforce. Reuse of existingCategories implements FR-008.
function categorySystemPrompt(existingCategories: ExistingCategory[]): string {
  const existingList =
    existingCategories.length > 0
      ? existingCategories.map((c) => `- ${c.key}: "${c.labelEn}"`).join('\n')
      : '(none yet — this is the first resource analyzed for this project)';

  return `You identify what TYPE of information a document contains — its role or nature — not its technical subject matter. Good categories: "Architecture," "Audit findings," "Meeting notes," "Roadmap," "Technical decisions." Bad categories: "Security," "Databases," "Frontend" (those are technical topics, not types of information).

A single document can genuinely contain more than one type of information at once. Propose every type that genuinely applies — do not force it down to just one, and do not invent one if none genuinely applies.

This project's existing categories:
${existingList}

If a type of information in this document matches one of the existing categories above, reuse its exact key rather than inventing a new, near-duplicate one. Only propose a new key when none of the existing categories genuinely fit.

Rules:
- A key is a short, stable, English, kebab-case identifier (e.g. "architecture-stack") used only for internal matching — never shown to a user.
- For every category (existing or new), also provide labelEn and labelFr: short, natural display labels describing the type of information, for English and French readers respectively — not a literal translation of the key.
- If nothing in the document clearly fits any type of information, return an empty list rather than forcing a guess.
- Respond only by calling the ${CATEGORY_TOOL_NAME} tool with the list of categories.`;
}

// Deliberately no LangChain/LangGraph (research.md Decision 3) — a thin,
// explicit wrapper directly over the SDK, matching
// AnthropicVulgarizationClient's established style.
@Injectable()
export class DocumentVulgarizationClient {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  // Submits one Claude Batch holding three requests — one per supported
  // locale (research.md Decision 3, revised) plus one locale-agnostic
  // category-detection request (specs/013 research.md Decision 1) — and
  // returns the single batch id all three are tracked under.
  async submitBatch(
    source: DocumentVulgarizationSource,
    title: string,
    existingCategories: ExistingCategory[] = [],
  ): Promise<string> {
    const content = await this.buildContent(source, title);
    const model = process.env.RESOURCE_VULGARIZATION_MODEL || DEFAULT_MODEL;

    const requests: Anthropic.Messages.Batches.BatchCreateParams.Request[] = [
      ...SUPPORTED_LOCALES.map(
        (locale): Anthropic.Messages.Batches.BatchCreateParams.Request => ({
          custom_id: locale,
          params: {
            model,
            // A whole-document rewrite that must stay "proportionally
            // thorough" (system prompt) can legitimately run long — 4096 was
            // observed truncating mid-tool-call on a real document (the
            // `content` field never got emitted, breaking output parsing).
            max_tokens: 8192,
            system: systemPrompt(locale),
            tools: [
              {
                name: TOOL_NAME,
                description:
                  'Submit the plain-language rewrite of the document.',
                input_schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    content: { type: 'string' },
                  },
                  required: ['title', 'content'],
                },
              },
            ],
            tool_choice: { type: 'tool', name: TOOL_NAME },
            messages: [{ role: 'user', content }],
          },
        }),
      ),
      {
        custom_id: CATEGORY_CUSTOM_ID,
        params: {
          model,
          max_tokens: 2048,
          system: categorySystemPrompt(existingCategories),
          tools: [
            {
              name: CATEGORY_TOOL_NAME,
              description:
                'Submit the categories (types of information) detected in this document.',
              input_schema: {
                type: 'object',
                properties: {
                  categories: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        key: { type: 'string' },
                        labelEn: { type: 'string' },
                        labelFr: { type: 'string' },
                      },
                      required: ['key', 'labelEn', 'labelFr'],
                    },
                  },
                },
                required: ['categories'],
              },
            },
          ],
          tool_choice: { type: 'tool', name: CATEGORY_TOOL_NAME },
          messages: [{ role: 'user', content }],
        },
      },
    ];

    const batch = await this.client.messages.batches.create({ requests });

    return batch.id;
  }

  // "pending" while the batch is still running; "failed" if either locale's
  // vulgarization isn't a success (no partial one-locale ready_for_review —
  // ResourceBatchSweepService treats this atomically). The category
  // request is best-effort by design (spec.md Edge Cases): a failed or
  // malformed category result never fails the whole batch — it just yields
  // no proposed categories, since the resource's own content must not be
  // blocked from ready_for_review/publishing by a category failure.
  async pollBatch(batchId: string): Promise<BatchPollResult> {
    const batch = await this.client.messages.batches.retrieve(batchId);
    if (batch.processing_status !== 'ended') {
      return { status: 'pending' };
    }

    const vulgarizations: LocaleVulgarization[] = [];
    let categories: CategoryProposal[] = [];
    const results = await this.client.messages.batches.results(batchId);
    for await (const item of results) {
      if (item.custom_id === CATEGORY_CUSTOM_ID) {
        categories = this.parseCategoriesBestEffort(item.result);
        continue;
      }

      if (item.result.type !== 'succeeded') {
        return {
          status: 'failed',
          reason: `${item.custom_id}: ${describeResultError(item.result)}`,
        };
      }
      // A malformed/incomplete tool call (e.g. the response got cut off by
      // max_tokens before the `content` field was written) must end this
      // resource's processing as "failed", not bubble up as an uncaught
      // exception — the caller (ResourceBatchSweepService) only catches
      // exceptions to log-and-retry, which would otherwise leave this
      // resource stuck in "processing" forever, re-polling the same
      // already-ended batch every sweep.
      try {
        const output = this.parseOutput(item.result.message);
        vulgarizations.push({ locale: item.custom_id as Locale, ...output });
      } catch (error) {
        return {
          status: 'failed',
          reason: `${item.custom_id}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    if (vulgarizations.length !== SUPPORTED_LOCALES.length) {
      return { status: 'failed', reason: 'incomplete batch results' };
    }

    return { status: 'succeeded', vulgarizations, categories };
  }

  private parseCategoriesBestEffort(
    result: Anthropic.Messages.MessageBatchResult,
  ): CategoryProposal[] {
    if (result.type !== 'succeeded') {
      return [];
    }
    try {
      const toolUseBlock = result.message.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );
      if (!toolUseBlock) {
        return [];
      }
      return CategoryDetectionOutputSchema.parse(toolUseBlock.input).categories;
    } catch {
      return [];
    }
  }

  private async buildContent(
    source: DocumentVulgarizationSource,
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

  // research.md Decision 2: no native page-vision equivalent for .docx —
  // extract text and any embedded images separately instead. A diagram
  // embedded in a .docx may describe less richly than the same diagram in
  // a PDF (no page layout/context) — a disclosed, accepted v1 asymmetry.
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
          // The resulting HTML is discarded (only the side-collected
          // `images` array is used) — `src` is required by mammoth's type
          // but never read.
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

  private parseOutput(message: Anthropic.Message): DocumentVulgarizationOutput {
    const toolUseBlock = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (!toolUseBlock) {
      throw new Error('Anthropic response did not include a tool_use block');
    }
    // Defense in depth (Constitution II): the API's input_schema already
    // constrains the model's output, but this is still a third-party
    // boundary — narrow it explicitly rather than trusting the shape.
    return DocumentVulgarizationOutputSchema.parse(toolUseBlock.input);
  }
}

// `errored` results carry Anthropic's actual error (type + message) — worth
// surfacing over the bare "errored" string, which gives no way to diagnose
// what actually went wrong (rate limit? invalid request? content policy?).
// `canceled`/`expired` have no further detail to extract.
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
