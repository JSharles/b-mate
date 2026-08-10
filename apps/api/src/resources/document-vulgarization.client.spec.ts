const mockBatchesCreate = jest.fn();
const mockBatchesRetrieve = jest.fn();
const mockBatchesResults = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      batches: {
        create: mockBatchesCreate,
        retrieve: mockBatchesRetrieve,
        results: mockBatchesResults,
      },
    },
  }));
});

jest.mock('mammoth', () => ({
  extractRawText: jest.fn(),
  convertToHtml: jest.fn(),
  images: {
    // The real mammoth.images.imgElement(fn) wraps `fn` into an internal
    // converter descriptor; for these tests it's enough that it returns
    // something identifiable — buildDocxContent() only ever passes it
    // straight through to convertToHtml()'s `convertImage` option, and the
    // mocked convertToHtml() below calls it directly as a plain function.
    imgElement: jest.fn((fn: unknown) => fn),
  },
}));

import mammoth from 'mammoth';
import { DocumentVulgarizationClient } from './document-vulgarization.client';

const mockedMammoth = jest.mocked(mammoth);

function firstCallArg<T>(mock: jest.Mock): T {
  return (mock.mock.calls[0] as unknown[])[0] as T;
}

interface BatchCreateCall {
  requests: Array<{
    custom_id: string;
    params: {
      model: string;
      max_tokens: number;
      system: string;
      tool_choice: { type: string; name: string };
      messages: Array<{ content: Array<{ type: string; text?: string }> }>;
    };
  }>;
}

function section(categoryKey: string, suffix: string) {
  return {
    categoryKey,
    titleEn: `Title EN ${suffix}`,
    contentEn: `Content EN ${suffix}`,
    titleFr: `Titre FR ${suffix}`,
    contentFr: `Contenu FR ${suffix}`,
  };
}

function sectionsToolUseMessage(sections: unknown[]) {
  return {
    content: [
      {
        type: 'tool_use',
        input: { sections },
      },
    ],
  };
}

// The SDK returns an async iterable from batches.results(); every test that
// exercises pollBatch needs the same shape. Synchronous generator delegated
// to by the async iterator — there is nothing to await over an in-memory
// array, and an `async *` with no await trips require-await.
function resultsIterable(items: unknown[]) {
  return Promise.resolve({
    [Symbol.asyncIterator]: function* () {
      yield* items;
    },
  });
}

describe('DocumentVulgarizationClient', () => {
  let client: DocumentVulgarizationClient;

  beforeEach(() => {
    delete process.env.RESOURCE_VULGARIZATION_MODEL;
    mockBatchesCreate.mockReset();
    mockBatchesRetrieve.mockReset();
    mockBatchesResults.mockReset();
    mockedMammoth.extractRawText.mockReset();
    mockedMammoth.convertToHtml.mockReset();
    client = new DocumentVulgarizationClient();
  });

  describe('submitBatch', () => {
    // specs/014-category-sections research.md Decision 1 and SC-008. 013 sent
    // three requests per document (one per locale, plus category detection);
    // sending one is both the cost saving and what structurally guarantees
    // the two languages agree on the split (FR-011).
    it('sends exactly one request, carrying both locales', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_123' });

      const batchId = await client.submitBatch(
        { kind: 'pdf', fileBuffer: Buffer.from('%PDF-1.4 fake') },
        'Architecture overview',
      );

      expect(batchId).toBe('batch_123');
      const call = firstCallArg<BatchCreateCall>(mockBatchesCreate);
      expect(call.requests).toHaveLength(1);
      expect(call.requests[0].custom_id).toBe('sections');
      expect(call.requests[0].params.model).toBe('claude-sonnet-5');
      expect(call.requests[0].params.tool_choice).toEqual({
        type: 'tool',
        name: 'submit_document_sections',
      });
    });

    it('sends a PDF as a native document content block', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_123' });

      await client.submitBatch(
        { kind: 'pdf', fileBuffer: Buffer.from('%PDF-1.4 fake') },
        'Architecture overview',
      );

      const call = firstCallArg<BatchCreateCall>(mockBatchesCreate);
      const content = call.requests[0].params.messages[0].content;
      expect(content.some((block) => block.type === 'document')).toBe(true);
    });

    // FR-001/FR-004: the prompt names the frozen list, and nothing else. 013's
    // prompt was handed the project's accumulated categories to reuse, which
    // is the feedback loop that made every tab identical.
    it('names the four fixed categories in the prompt and takes no category input', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_cat' });

      await client.submitBatch(
        { kind: 'pdf', fileBuffer: Buffer.from('%PDF') },
        'Doc',
      );

      const { system } =
        firstCallArg<BatchCreateCall>(mockBatchesCreate).requests[0].params;
      expect(system).toContain('overview:');
      expect(system).toContain('how_it_works:');
      expect(system).toContain('planning:');
      expect(system).toContain('other:');
    });

    // FR-007 is the requirement most at risk from an extraction-shaped
    // prompt: asking for per-category extracts invites summarizing.
    it('keeps the no-summarizing and lose-nothing guarantees in the prompt', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_cat' });

      await client.submitBatch(
        { kind: 'pdf', fileBuffer: Buffer.from('%PDF') },
        'Doc',
      );

      const { system } =
        firstCallArg<BatchCreateCall>(mockBatchesCreate).requests[0].params;
      expect(system).toContain('it is not the same as summarizing');
      expect(system).toContain('exactly one section');
      expect(system).toContain('never skip or silently ignore visual content');
      expect(system).toContain('Never invent facts');
    });

    // The union of a document's sections is about as long as a whole rewrite,
    // and both languages now arrive in one response — 013's 8192 would
    // truncate mid-section.
    it('requests enough max_tokens for both locales of every section', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_123' });

      await client.submitBatch(
        { kind: 'pdf', fileBuffer: Buffer.from('%PDF-1.4 fake') },
        'Architecture overview',
      );

      const call = firstCallArg<BatchCreateCall>(mockBatchesCreate);
      expect(call.requests[0].params.max_tokens).toBe(32000);
    });

    it('uses the RESOURCE_VULGARIZATION_MODEL env var when set', async () => {
      process.env.RESOURCE_VULGARIZATION_MODEL = 'claude-haiku-4-5';
      mockBatchesCreate.mockResolvedValue({ id: 'batch_1' });

      await client.submitBatch(
        { kind: 'pdf', fileBuffer: Buffer.from('%PDF') },
        'Doc',
      );

      const call = firstCallArg<BatchCreateCall>(mockBatchesCreate);
      expect(call.requests[0].params.model).toBe('claude-haiku-4-5');
    });

    it('sends an image as a native image content block', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_2' });

      await client.submitBatch(
        {
          kind: 'image',
          fileBuffer: Buffer.from('fake-png'),
          mimeType: 'image/png',
        },
        'Schema',
      );

      const call = firstCallArg<BatchCreateCall>(mockBatchesCreate);
      const content = call.requests[0].params.messages[0].content;
      expect(content.some((block) => block.type === 'image')).toBe(true);
    });

    it('extracts text and embedded images from a .docx buffer via mammoth, sending them as text/image content', async () => {
      mockedMammoth.extractRawText.mockResolvedValue({
        value: 'Some extracted prose.',
        messages: [],
      });
      mockedMammoth.convertToHtml.mockImplementation(
        async (_input, options) => {
          const convertImage = (
            options as unknown as {
              convertImage: (image: {
                contentType: string;
                read: (encoding: string) => Promise<string>;
              }) => Promise<unknown>;
            }
          ).convertImage;
          await convertImage({
            contentType: 'image/png',
            read: () => Promise.resolve('base64imagedata'),
          });
          return { value: '<p>ignored</p>', messages: [] };
        },
      );
      mockBatchesCreate.mockResolvedValue({ id: 'batch_3' });

      await client.submitBatch(
        { kind: 'docx', fileBuffer: Buffer.from('fake-docx') },
        'Report',
      );

      const call = firstCallArg<BatchCreateCall>(mockBatchesCreate);
      const content = call.requests[0].params.messages[0].content;
      expect(
        content.some(
          (block) =>
            block.type === 'text' &&
            block.text?.includes('Some extracted prose.'),
        ),
      ).toBe(true);
      expect(content.some((block) => block.type === 'image')).toBe(true);
    });

    it('sends plain text as a text content block (Notion-sourced path)', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_4' });

      await client.submitBatch(
        { kind: 'text', text: 'Page content here.' },
        'Notion page',
      );

      const call = firstCallArg<BatchCreateCall>(mockBatchesCreate);
      const content = call.requests[0].params.messages[0].content;
      expect(content).toEqual([{ type: 'text', text: 'Page content here.' }]);
    });
  });

  describe('pollBatch', () => {
    it('returns pending while the batch has not ended', async () => {
      mockBatchesRetrieve.mockResolvedValue({
        processing_status: 'in_progress',
      });

      await expect(client.pollBatch('batch_1')).resolves.toEqual({
        status: 'pending',
      });
      expect(mockBatchesResults).not.toHaveBeenCalled();
    });

    it('returns every section, with both locales, once the batch has ended successfully', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockReturnValue(
        resultsIterable([
          {
            custom_id: 'sections',
            result: {
              type: 'succeeded',
              message: sectionsToolUseMessage([
                section('overview', 'A'),
                section('planning', 'B'),
              ]),
            },
          },
        ]),
      );

      const result = await client.pollBatch('batch_1');

      expect(result).toEqual({
        status: 'succeeded',
        sections: [section('overview', 'A'), section('planning', 'B')],
      });
    });

    // FR-010 allows one section per (resource, category) and the database
    // enforces it — a model that splits one category across two entries is a
    // formatting quirk, not a reason to fail a whole document.
    it('merges duplicate categories instead of emitting two sections for one key', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockReturnValue(
        resultsIterable([
          {
            custom_id: 'sections',
            result: {
              type: 'succeeded',
              message: sectionsToolUseMessage([
                section('overview', 'first'),
                section('overview', 'second'),
              ]),
            },
          },
        ]),
      );

      const result = await client.pollBatch('batch_1');

      expect(result).toEqual({
        status: 'succeeded',
        sections: [
          {
            categoryKey: 'overview',
            titleEn: 'Title EN first',
            contentEn: 'Content EN first\n\nContent EN second',
            titleFr: 'Titre FR first',
            contentFr: 'Contenu FR first\n\nContenu FR second',
          },
        ],
      });
    });

    // Unlike 013, there is no best-effort path: sections *are* the content, so
    // a document that yields none is a failure the contributor must see —
    // not a resource that reaches ready_for_review holding nothing.
    it('fails the resource when the analysis returns no sections', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockReturnValue(
        resultsIterable([
          {
            custom_id: 'sections',
            result: {
              type: 'succeeded',
              message: sectionsToolUseMessage([]),
            },
          },
        ]),
      );

      await expect(client.pollBatch('batch_1')).resolves.toEqual({
        status: 'failed',
        reason: 'The analysis produced no readable content for this document.',
      });
    });

    // This is the path that would have named the 8000 px rejection
    // immediately, instead of leaving it to be found by querying the provider
    // by hand (research.md Decision 6).
    it('returns failed with the underlying provider error message', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockReturnValue(
        resultsIterable([
          {
            custom_id: 'sections',
            result: {
              type: 'errored',
              error: {
                error: {
                  type: 'invalid_request_error',
                  message:
                    'At least one of the image dimensions exceed max allowed size: 8000 pixels',
                },
              },
            },
          },
        ]),
      );

      await expect(client.pollBatch('batch_1')).resolves.toEqual({
        status: 'failed',
        reason:
          'invalid_request_error: At least one of the image dimensions exceed max allowed size: 8000 pixels',
      });
    });

    it('returns failed for a canceled or expired result', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockReturnValue(
        resultsIterable([
          { custom_id: 'sections', result: { type: 'expired' } },
        ]),
      );

      await expect(client.pollBatch('batch_1')).resolves.toEqual({
        status: 'failed',
        reason: 'expired',
      });
    });

    // A response truncated by max_tokens loses a trailing field. Throwing here
    // would be caught by the sweep's log-and-retry, leaving the resource stuck
    // in `processing` forever, re-polling an already-ended batch every sweep.
    it('returns failed instead of throwing when the tool call is malformed or truncated', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockReturnValue(
        resultsIterable([
          {
            custom_id: 'sections',
            result: {
              type: 'succeeded',
              message: sectionsToolUseMessage([
                { categoryKey: 'overview', titleEn: 'Only a title' },
              ]),
            },
          },
        ]),
      );

      const result = await client.pollBatch('batch_1');

      expect(result.status).toBe('failed');
    });

    it('returns failed when the response carries no tool_use block at all', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockReturnValue(
        resultsIterable([
          {
            custom_id: 'sections',
            result: {
              type: 'succeeded',
              message: { content: [{ type: 'text', text: 'no tool call' }] },
            },
          },
        ]),
      );

      await expect(client.pollBatch('batch_1')).resolves.toEqual({
        status: 'failed',
        reason: 'Anthropic response did not include a tool_use block',
      });
    });

    it('rejects a category key outside the frozen list', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockReturnValue(
        resultsIterable([
          {
            custom_id: 'sections',
            result: {
              type: 'succeeded',
              message: sectionsToolUseMessage([
                section('architecture-stack', 'invented'),
              ]),
            },
          },
        ]),
      );

      const result = await client.pollBatch('batch_1');

      expect(result.status).toBe('failed');
    });

    it('returns failed when an ended batch yields no results at all', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockReturnValue(resultsIterable([]));

      await expect(client.pollBatch('batch_1')).resolves.toEqual({
        status: 'failed',
        reason: 'incomplete batch results',
      });
    });
  });
});
