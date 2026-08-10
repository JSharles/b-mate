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
    // The real imgElement(fn) wraps `fn` in an internal descriptor; here it is
    // enough that it returns something callable, because buildDocxContent only
    // passes it through to convertToHtml, which the mock calls directly.
    imgElement: jest.fn((fn: unknown) => fn),
  },
}));

import mammoth from 'mammoth';
import { ReferenceAnalysisClient } from './reference-analysis.client';

const mockedMammoth = jest.mocked(mammoth);

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

function firstCall(): BatchCreateCall {
  return (mockBatchesCreate.mock.calls[0] as unknown[])[0] as BatchCreateCall;
}

function toolUseMessage(categories: unknown[]) {
  return { content: [{ type: 'tool_use', input: { categories } }] };
}

function resultsIterable(items: unknown[]) {
  return Promise.resolve({
    [Symbol.asyncIterator]: function* () {
      yield* items;
    },
  });
}

function category(categoryKey: string, suffix: string) {
  return {
    categoryKey,
    extract: `Extract ${suffix}`,
    reference: `Reference ${suffix}`,
  };
}

const pdf = { kind: 'pdf' as const, fileBuffer: Buffer.from('%PDF-1.4 fake') };

describe('ReferenceAnalysisClient', () => {
  let client: ReferenceAnalysisClient;

  beforeEach(() => {
    delete process.env.RESOURCE_VULGARIZATION_MODEL;
    mockBatchesCreate.mockReset();
    mockBatchesRetrieve.mockReset();
    mockBatchesResults.mockReset();
    mockedMammoth.extractRawText.mockReset();
    mockedMammoth.convertToHtml.mockReset();
    client = new ReferenceAnalysisClient();
  });

  describe('submitIngestion', () => {
    // research.md Decision 2: chaining classify-then-merge would cost a full
    // sweep cycle per link, turning one wait into two.
    it('sends exactly one request per document', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_1' });

      const batchId = await client.submitIngestion(pdf, 'Brief', {});

      expect(batchId).toBe('batch_1');
      const call = firstCall();
      expect(call.requests).toHaveLength(1);
      expect(call.requests[0].params.tool_choice).toEqual({
        type: 'tool',
        name: 'submit_reference_update',
      });
      expect(call.requests[0].params.max_tokens).toBe(32000);
    });

    it('names the four fixed categories in the prompt', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_1' });

      await client.submitIngestion(pdf, 'Brief', {});

      const { system } = firstCall().requests[0].params;
      expect(system).toContain('overview:');
      expect(system).toContain('how_it_works:');
      expect(system).toContain('planning:');
      expect(system).toContain('other:');
    });

    // FR-003 is the requirement most likely to fail silently: "produce a clean
    // document" reads to a model as licence to compress, and this is the layer
    // where compression is unrecoverable.
    it('states exhaustiveness as the constraint that wins, and forbids vulgarizing', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_1' });

      await client.submitIngestion(pdf, 'Brief', {});

      const { system } = firstCall().requests[0].params;
      expect(system).toContain('exhaustiveness wins');
      expect(system).toContain('anything you leave out is lost for good');
      expect(system).toContain('must NOT be simplified');
      expect(system).toContain('Never invent facts');
      expect(system).toContain('Never skip visual content');
    });

    // FR-004: the whole point of the category being the unit. 014 appended,
    // and that is why a client ended up reconciling several blocks.
    it('hands the existing reference content over and asks for its next version', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_1' });

      await client.submitIngestion(pdf, 'Notes', {
        planning: 'Delivery is planned for March.',
      });

      const { system } = firstCall().requests[0].params;
      expect(system).toContain('Delivery is planned for March.');
      expect(system).toContain('next version, not a second document');
      expect(system).toContain('Do not append it as a separate block');
    });

    it('tells the model when there is no reference content yet', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_1' });

      await client.submitIngestion(pdf, 'Brief', {});

      expect(firstCall().requests[0].params.system).toContain(
        'this is the first document',
      );
    });

    // Sources disagreeing on a client-visible fact is how a client gets told
    // the wrong thing — the prompt must forbid silent arbitration.
    it('forbids silently picking a side between contradicting sources', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_1' });

      await client.submitIngestion(pdf, 'Brief', {});

      expect(firstCall().requests[0].params.system).toContain(
        'Never pick one silently',
      );
    });

    it('uses the configured model when the env var is set', async () => {
      process.env.RESOURCE_VULGARIZATION_MODEL = 'claude-haiku-4-5';
      mockBatchesCreate.mockResolvedValue({ id: 'batch_1' });

      await client.submitIngestion(pdf, 'Brief', {});

      expect(firstCall().requests[0].params.model).toBe('claude-haiku-4-5');
    });

    it('sends a PDF as a native document block', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_1' });

      await client.submitIngestion(pdf, 'Brief', {});

      const content = firstCall().requests[0].params.messages[0].content;
      expect(content.some((block) => block.type === 'document')).toBe(true);
    });

    it('sends an image as a native image block', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_1' });

      await client.submitIngestion(
        {
          kind: 'image',
          fileBuffer: Buffer.from('fake-png'),
          mimeType: 'image/png',
        },
        'Schema',
        {},
      );

      const content = firstCall().requests[0].params.messages[0].content;
      expect(content.some((block) => block.type === 'image')).toBe(true);
    });

    it('extracts text and embedded images from a .docx', async () => {
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
      mockBatchesCreate.mockResolvedValue({ id: 'batch_1' });

      await client.submitIngestion(
        { kind: 'docx', fileBuffer: Buffer.from('fake-docx') },
        'Report',
        {},
      );

      const content = firstCall().requests[0].params.messages[0].content;
      expect(
        content.some(
          (block) =>
            block.type === 'text' &&
            block.text?.includes('Some extracted prose.'),
        ),
      ).toBe(true);
      expect(content.some((block) => block.type === 'image')).toBe(true);
    });

    it('sends a Notion page as plain text', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_1' });

      await client.submitIngestion(
        { kind: 'text', text: 'Page content here.' },
        'Notion page',
        {},
      );

      expect(firstCall().requests[0].params.messages[0].content).toEqual([
        { type: 'text', text: 'Page content here.' },
      ]);
    });
  });

  describe('pollIngestion', () => {
    it('returns pending while the batch has not ended', async () => {
      mockBatchesRetrieve.mockResolvedValue({
        processing_status: 'in_progress',
      });

      await expect(client.pollIngestion('batch_1')).resolves.toEqual({
        status: 'pending',
      });
      expect(mockBatchesResults).not.toHaveBeenCalled();
    });

    it('returns every category with its extract and merged reference', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockReturnValue(
        resultsIterable([
          {
            custom_id: 'reference',
            result: {
              type: 'succeeded',
              message: toolUseMessage([
                category('overview', 'A'),
                category('planning', 'B'),
              ]),
            },
          },
        ]),
      );

      await expect(client.pollIngestion('batch_1')).resolves.toEqual({
        status: 'succeeded',
        categories: [
          { ...category('overview', 'A'), questions: [] },
          { ...category('planning', 'B'), questions: [] },
        ],
      });
    });

    // The database enforces one body per category; a model splitting one
    // category across two entries is a formatting quirk, not a reason to fail
    // a whole document.
    it('merges duplicate categories instead of emitting two entries for one key', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockReturnValue(
        resultsIterable([
          {
            custom_id: 'reference',
            result: {
              type: 'succeeded',
              message: toolUseMessage([
                category('overview', 'first'),
                category('overview', 'second'),
              ]),
            },
          },
        ]),
      );

      await expect(client.pollIngestion('batch_1')).resolves.toEqual({
        status: 'succeeded',
        categories: [
          {
            categoryKey: 'overview',
            extract: 'Extract first\n\nExtract second',
            reference: 'Reference first\n\nReference second',
            questions: [],
          },
        ],
      });
    });

    it('fails the document when it contributed nothing', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockReturnValue(
        resultsIterable([
          {
            custom_id: 'reference',
            result: { type: 'succeeded', message: toolUseMessage([]) },
          },
        ]),
      );

      await expect(client.pollIngestion('batch_1')).resolves.toEqual({
        status: 'failed',
        reason:
          'This document did not contribute anything to the project documentation.',
      });
    });

    it('surfaces the provider error verbatim', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockReturnValue(
        resultsIterable([
          {
            custom_id: 'reference',
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

      await expect(client.pollIngestion('batch_1')).resolves.toEqual({
        status: 'failed',
        reason:
          'invalid_request_error: At least one of the image dimensions exceed max allowed size: 8000 pixels',
      });
    });

    // Throwing here would be caught by the sweep's log-and-retry, leaving the
    // document stuck in `pending` forever, re-polling an ended batch.
    it('returns failed rather than throwing on a truncated tool call', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockReturnValue(
        resultsIterable([
          {
            custom_id: 'reference',
            result: {
              type: 'succeeded',
              message: toolUseMessage([
                { categoryKey: 'overview', extract: 'only an extract' },
              ]),
            },
          },
        ]),
      );

      const result = await client.pollIngestion('batch_1');

      expect(result.status).toBe('failed');
    });

    it('rejects a category key outside the frozen list', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockReturnValue(
        resultsIterable([
          {
            custom_id: 'reference',
            result: {
              type: 'succeeded',
              message: toolUseMessage([category('architecture', 'invented')]),
            },
          },
        ]),
      );

      const result = await client.pollIngestion('batch_1');

      expect(result.status).toBe('failed');
    });

    it('returns failed when the response carries no tool_use block', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockReturnValue(
        resultsIterable([
          {
            custom_id: 'reference',
            result: {
              type: 'succeeded',
              message: { content: [{ type: 'text', text: 'no tool call' }] },
            },
          },
        ]),
      );

      await expect(client.pollIngestion('batch_1')).resolves.toEqual({
        status: 'failed',
        reason: 'Anthropic response did not include a tool_use block',
      });
    });

    it('returns failed when an ended batch yields no result at all', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockReturnValue(resultsIterable([]));

      await expect(client.pollIngestion('batch_1')).resolves.toEqual({
        status: 'failed',
        reason: 'incomplete batch results',
      });
    });
  });

  // specs/015 US5. The bar is the point: a question is worth a contributor's
  // attention only when the answer changes what their client ends up reading.
  // A prompt that invites questions freely turns the one human gate into a
  // chore, and a chore gets clicked through.
  describe('questions', () => {
    it('states the cap, the ranking and the bar in the ingestion prompt', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_1' });

      await client.submitIngestion(pdf, 'Brief', {});

      const { system } = firstCall().requests[0].params;
      expect(system).toContain('up to 5 questions');
      expect(system).toContain('rank 1 is the question whose answer');
      expect(system).toContain(
        'would change what their client is eventually told',
      );
      expect(system).toContain('do not ask');
    });

    // FR-023 hinges on this: the marker is written at the same time as the
    // question, so an unanswered question leaves the point visibly open rather
    // than silently arbitrated — with nothing to do if the contributor simply
    // accepts the draft as it stands.
    it('asks for the open point to be marked in the text alongside every question', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_1' });

      await client.submitIngestion(pdf, 'Brief', {});

      expect(firstCall().requests[0].params.system).toContain(
        '[to clarify: ...]',
      );
    });

    it('folds answered questions into the rebuild and asks for their markers to go', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_1' });

      await client.submitRebuild('planning', ['Extract A'], null, [
        { question: 'Is the migration February or March?', answer: 'March.' },
      ]);

      const { system } = firstCall().requests[0].params;
      expect(system).toContain('Is the migration February or March?');
      expect(system).toContain('March.');
      expect(system).toContain('remove its "[to clarify: ...]" marker');
    });

    it('mentions no open point when the rebuild answers nothing', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_1' });

      await client.submitRebuild('planning', ['Extract A'], null);

      expect(firstCall().requests[0].params.system).not.toContain(
        'The developer answered these open points',
      );
    });

    // FR-022 enforced where it actually binds. The prompt asks for five;
    // this is what guarantees a contributor never sees a sixth.
    it('caps the questions at five and orders them by impact', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockReturnValue(
        resultsIterable([
          {
            custom_id: 'reference',
            result: {
              type: 'succeeded',
              message: toolUseMessage([
                {
                  ...category('overview', 'A'),
                  questions: [
                    { question: 'Sixth', rank: 6 },
                    { question: 'Second', rank: 2 },
                    { question: 'First', rank: 1 },
                    { question: 'Fourth', rank: 4 },
                    { question: 'Fifth', rank: 5 },
                    { question: 'Third', rank: 3 },
                  ],
                },
              ]),
            },
          },
        ]),
      );

      const result = await client.pollIngestion('batch_1');

      expect(
        result.status === 'succeeded' &&
          result.categories[0].questions?.map((q) => q.question),
      ).toEqual(['First', 'Second', 'Third', 'Fourth', 'Fifth']);
    });

    // The common case, and deliberately so: most documents raise nothing worth
    // interrupting a contributor for.
    it('yields no questions when the model asked none', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockReturnValue(
        resultsIterable([
          {
            custom_id: 'reference',
            result: {
              type: 'succeeded',
              message: toolUseMessage([category('overview', 'A')]),
            },
          },
        ]),
      );

      const result = await client.pollIngestion('batch_1');

      expect(
        result.status === 'succeeded' && result.categories[0].questions,
      ).toEqual([]);
    });
  });
});
