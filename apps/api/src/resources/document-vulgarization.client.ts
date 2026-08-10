import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import mammoth from 'mammoth';
import {
  DocumentSection,
  DocumentSectionsOutputSchema,
} from './document-sections-output.schema';
import { RESOURCE_CATEGORIES } from './resource-categories';

// research.md Decision 3: a heavier task than task-vulgarization's short
// rewrites (a whole document, potentially with diagrams, must keep its
// important information) — defaults to a stronger tier, but stays
// configurable so cost/quality can be retuned without a code change.
const DEFAULT_MODEL = 'claude-sonnet-5';

const TOOL_NAME = 'submit_document_sections';

// specs/014-category-sections research.md Decision 1. One request per
// document, carrying every section in both locales, replacing 013's three
// (one per locale for a whole-document rewrite, plus category detection).
const SECTIONS_CUSTOM_ID = 'sections';

// The union of a document's sections is comparable in length to a whole
// proportionally-thorough rewrite, and we ask for two languages of it in one
// response — so this is well above 013's 8192. The Batch API has no HTTP
// timeout to worry about (unlike a synchronous request, where anything this
// large would need streaming). Truncation still degrades safely: the tool
// call fails schema validation and the resource ends as `failed` with a
// readable reason, rather than persisting half a document.
const MAX_TOKENS = 32000;

// Whole-document/vision for pdf/image (research.md Decision 1) — Claude
// reads the PDF's text and renders its pages as images in the same call, so
// diagrams/schemas are described. docx gets text (+ any extractable
// embedded images) via mammoth instead (Decision 2 — no native page-vision
// equivalent for that format). text is for a Notion-sourced resource's
// flattened page content (Decision 5), or a pre-extracted docx fallback.
//
// An `image` source has already been through ImageNormalizer by the time it
// reaches here (specs/014 research.md Decision 6) — the provider rejects
// anything over 8000 px on its long edge, per-request at execution time.
export type DocumentVulgarizationSource =
  | { kind: 'pdf'; fileBuffer: Buffer }
  | { kind: 'image'; fileBuffer: Buffer; mimeType: 'image/png' | 'image/jpeg' }
  | { kind: 'docx'; fileBuffer: Buffer }
  | { kind: 'text'; text: string };

export type BatchPollResult =
  | { status: 'pending' }
  | { status: 'succeeded'; sections: DocumentSection[] }
  | { status: 'failed'; reason: string };

// specs/014-category-sections research.md Decision 8. Keeps 011's
// vulgarization guarantees verbatim — this is a rewrite, not a summary, and
// dropping detail to stay brief is the failure mode the whole feature exists
// to avoid — and adds the routing rule on top of them.
//
// The coverage obligation (FR-007) and the `other` category are a pair: asking
// for per-category extracts is exactly the kind of instruction that invites
// summarizing, and `other` is what makes "lose nothing" satisfiable without
// padding the specific categories with material that doesn't belong there.
function systemPrompt(): string {
  const categoryList = RESOURCE_CATEGORIES.map(
    (category) => `- ${category.key}: ${category.holds}`,
  ).join('\n');

  return `You read a document written by a software developer and rewrite it for their client, who has no technical or subject-matter background.

Vulgarizing means rewriting in plain, everyday language — it is not the same as summarizing. Preserve every piece of information that matters in the source: facts, figures, decisions, requirements, dates, names. A long document should produce a proportionally thorough plain-language rewrite, not a short summary that drops detail to stay brief.

A document is not about one single thing. A developer's document is often messy: a few paragraphs on what the project is for, a diagram, a couple of delivery dates, all interleaved. Your job is to split what the document says across these fixed categories:

${categoryList}

Rules:
- Produce one section per category that the document genuinely says something about. Return the sections as a list, in the order you judge most useful to read.
- Do NOT produce a section for a category the document does not address. Never invent, pad, or stretch content to fill a category — returning three sections when only three apply is correct.
- Everything of substance in the document must end up in exactly one section. Do not repeat the same material across two sections, and do not drop material because it fits no category neatly — that is what "other" is for.
- Each section covers ONLY what the document says about that category. A reader of one section should not be told about another category's material.
- If the source contains a diagram, chart, schema, or any other visual content, describe in plain language what it shows and what it means, as part of the relevant section — never skip or silently ignore visual content.
- Never invent facts, figures, dates, or details that are not present in the source.
- Avoid jargon; when a technical term is unavoidable, briefly explain what it means in context.
- Give every section a short, descriptive title saying what that section covers — not the category's name.
- Write each section twice: titleEn/contentEn in English, titleFr/contentFr in French. Both must carry the same content, regardless of the language the source is written in — never return a section in one language only.
- Respond only by calling the ${TOOL_NAME} tool.`;
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

  // Submits one Claude Batch holding a single request, and returns the batch
  // id it is tracked under.
  async submitBatch(
    source: DocumentVulgarizationSource,
    title: string,
  ): Promise<string> {
    const content = await this.buildContent(source, title);
    const model = process.env.RESOURCE_VULGARIZATION_MODEL || DEFAULT_MODEL;

    const batch = await this.client.messages.batches.create({
      requests: [
        {
          custom_id: SECTIONS_CUSTOM_ID,
          params: {
            model,
            max_tokens: MAX_TOKENS,
            system: systemPrompt(),
            tools: [
              {
                name: TOOL_NAME,
                description:
                  "Submit the document's content, split into per-category plain-language sections.",
                input_schema: {
                  type: 'object',
                  properties: {
                    sections: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          categoryKey: {
                            type: 'string',
                            enum: RESOURCE_CATEGORIES.map((c) => c.key),
                          },
                          titleEn: { type: 'string' },
                          contentEn: { type: 'string' },
                          titleFr: { type: 'string' },
                          contentFr: { type: 'string' },
                        },
                        required: [
                          'categoryKey',
                          'titleEn',
                          'contentEn',
                          'titleFr',
                          'contentFr',
                        ],
                      },
                    },
                  },
                  required: ['sections'],
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

  // "pending" while the batch is still running. Unlike 013 there is no
  // best-effort degradation path: sections *are* the resource's content now,
  // so anything that isn't a clean, non-empty parse ends the resource as
  // `failed` with a readable reason (spec.md FR-012). 013 could afford to
  // shrug off a bad category result because the whole-document rewrite still
  // shipped; that rewrite no longer exists.
  async pollBatch(batchId: string): Promise<BatchPollResult> {
    const batch = await this.client.messages.batches.retrieve(batchId);
    if (batch.processing_status !== 'ended') {
      return { status: 'pending' };
    }

    const results = await this.client.messages.batches.results(batchId);
    for await (const item of results) {
      if (item.result.type !== 'succeeded') {
        return {
          status: 'failed',
          reason: describeResultError(item.result),
        };
      }

      // A malformed or incomplete tool call (e.g. the response was cut off by
      // max_tokens before a section's `contentFr` was written) must end this
      // resource as "failed", not bubble up as an uncaught exception — the
      // caller only catches exceptions to log-and-retry, which would leave
      // the resource stuck in "processing" forever, re-polling the same
      // already-ended batch on every sweep.
      try {
        const sections = this.parseSections(item.result.message);
        if (sections.length === 0) {
          return {
            status: 'failed',
            reason:
              'The analysis produced no readable content for this document.',
          };
        }
        return { status: 'succeeded', sections };
      } catch (error) {
        return {
          status: 'failed',
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return { status: 'failed', reason: 'incomplete batch results' };
  }

  private parseSections(message: Anthropic.Message): DocumentSection[] {
    const toolUseBlock = message.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );
    if (!toolUseBlock) {
      throw new Error('Anthropic response did not include a tool_use block');
    }

    const { sections } = DocumentSectionsOutputSchema.parse(toolUseBlock.input);
    return mergeByCategory(sections);
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
}

// FR-010 allows at most one section per (resource, category), and the
// database enforces it. A model that splits one category's material across
// two entries is producing a formatting quirk, not an error worth failing a
// whole document over — so the entries are concatenated in arrival order
// rather than colliding on the unique constraint (spec.md Edge Cases).
function mergeByCategory(sections: DocumentSection[]): DocumentSection[] {
  const merged = new Map<string, DocumentSection>();

  for (const section of sections) {
    const existing = merged.get(section.categoryKey);
    if (!existing) {
      merged.set(section.categoryKey, section);
      continue;
    }
    merged.set(section.categoryKey, {
      ...existing,
      contentEn: `${existing.contentEn}\n\n${section.contentEn}`,
      contentFr: `${existing.contentFr}\n\n${section.contentFr}`,
    });
  }

  return Array.from(merged.values());
}

// `errored` results carry Anthropic's actual error (type + message) — worth
// surfacing over the bare "errored" string, which gives no way to diagnose
// what actually went wrong (rate limit? invalid request? content policy?).
// This is what would have named the 8000 px rejection immediately, rather
// than leaving it to be found by querying the provider by hand.
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
