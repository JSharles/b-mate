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

function toolUseMessage(title: string, content: string) {
  return {
    content: [
      {
        type: 'tool_use',
        input: { title, content },
      },
    ],
  };
}

function categoriesToolUseMessage(
  categories: Array<{ key: string; labelEn: string; labelFr: string }>,
) {
  return {
    content: [
      {
        type: 'tool_use',
        input: { categories },
      },
    ],
  };
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
    it('sends a PDF as a native document content block, one request per supported locale plus one for categories', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_123' });

      const batchId = await client.submitBatch(
        { kind: 'pdf', fileBuffer: Buffer.from('%PDF-1.4 fake') },
        'Architecture overview',
      );

      expect(batchId).toBe('batch_123');
      const call = firstCallArg<{
        requests: Array<{ custom_id: string; params: { model: string } }>;
      }>(mockBatchesCreate);
      expect(call.requests.map((r) => r.custom_id).sort()).toEqual([
        'categories',
        'en',
        'fr',
      ]);
      expect(call.requests[0].params.model).toBe('claude-sonnet-5');
      const content = (
        call.requests[0].params as unknown as {
          messages: Array<{ content: Array<{ type: string }> }>;
        }
      ).messages[0].content;
      expect(content.some((block) => block.type === 'document')).toBe(true);
    });

    it('includes the project existing categories in the category-detection request system prompt', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_cat' });

      await client.submitBatch(
        { kind: 'pdf', fileBuffer: Buffer.from('%PDF') },
        'Doc',
        [{ key: 'architecture-stack', labelEn: 'Architecture & stack' }],
      );

      const call = firstCallArg<{
        requests: Array<{
          custom_id: string;
          params: { system: string; tool_choice: { name: string } };
        }>;
      }>(mockBatchesCreate);
      const categoryRequest = call.requests.find(
        (r) => r.custom_id === 'categories',
      );
      expect(categoryRequest?.params.system).toContain('architecture-stack');
      expect(categoryRequest?.params.system).toContain('Architecture & stack');
      expect(categoryRequest?.params.tool_choice.name).toBe(
        'submit_categories',
      );
    });

    it('tells the category-detection prompt there are no existing categories yet when the project has none', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_cat_empty' });

      await client.submitBatch({ kind: 'text', text: 'content' }, 'Doc', []);

      const call = firstCallArg<{
        requests: Array<{ custom_id: string; params: { system: string } }>;
      }>(mockBatchesCreate);
      const categoryRequest = call.requests.find(
        (r) => r.custom_id === 'categories',
      );
      expect(categoryRequest?.params.system).toContain('none yet');
    });

    it('requests enough max_tokens for a proportionally thorough rewrite of a long document', async () => {
      mockBatchesCreate.mockResolvedValue({ id: 'batch_123' });

      await client.submitBatch(
        { kind: 'pdf', fileBuffer: Buffer.from('%PDF-1.4 fake') },
        'Architecture overview',
      );

      const call = firstCallArg<{
        requests: Array<{ params: { max_tokens: number } }>;
      }>(mockBatchesCreate);
      expect(call.requests[0].params.max_tokens).toBe(8192);
    });

    it('uses the RESOURCE_VULGARIZATION_MODEL env var when set', async () => {
      process.env.RESOURCE_VULGARIZATION_MODEL = 'claude-haiku-4-5';
      mockBatchesCreate.mockResolvedValue({ id: 'batch_1' });

      await client.submitBatch(
        { kind: 'pdf', fileBuffer: Buffer.from('%PDF') },
        'Doc',
      );

      const call = firstCallArg<{
        requests: Array<{ params: { model: string } }>;
      }>(mockBatchesCreate);
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

      const call = firstCallArg<{
        requests: Array<{
          params: { messages: Array<{ content: Array<{ type: string }> }> };
        }>;
      }>(mockBatchesCreate);
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

      const call = firstCallArg<{
        requests: Array<{
          params: {
            messages: Array<{
              content: Array<{ type: string; text?: string }>;
            }>;
          };
        }>;
      }>(mockBatchesCreate);
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

      const call = firstCallArg<{
        requests: Array<{
          params: {
            messages: Array<{
              content: Array<{ type: string; text?: string }>;
            }>;
          };
        }>;
      }>(mockBatchesCreate);
      const content = call.requests[0].params.messages[0].content;
      expect(content).toEqual([{ type: 'text', text: 'Page content here.' }]);
    });
  });

  describe('pollBatch', () => {
    it('returns pending while the batch has not ended', async () => {
      mockBatchesRetrieve.mockResolvedValue({
        processing_status: 'in_progress',
      });

      const result = await client.pollBatch('batch_123');

      expect(result).toEqual({ status: 'pending' });
      expect(mockBatchesResults).not.toHaveBeenCalled();
    });

    it('returns succeeded with both locales and the proposed categories parsed once the batch has ended successfully', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockResolvedValue([
        {
          custom_id: 'en',
          result: {
            type: 'succeeded',
            message: toolUseMessage('Title EN', 'Content EN'),
          },
        },
        {
          custom_id: 'fr',
          result: {
            type: 'succeeded',
            message: toolUseMessage('Titre FR', 'Contenu FR'),
          },
        },
        {
          custom_id: 'categories',
          result: {
            type: 'succeeded',
            message: categoriesToolUseMessage([
              {
                key: 'architecture-stack',
                labelEn: 'Architecture & stack',
                labelFr: 'Architecture et stack',
              },
            ]),
          },
        },
      ]);

      const result = await client.pollBatch('batch_123');

      expect(result).toEqual({
        status: 'succeeded',
        vulgarizations: expect.arrayContaining([
          { locale: 'en', title: 'Title EN', content: 'Content EN' },
          { locale: 'fr', title: 'Titre FR', content: 'Contenu FR' },
        ]) as unknown,
        categories: [
          {
            key: 'architecture-stack',
            labelEn: 'Architecture & stack',
            labelFr: 'Architecture et stack',
          },
        ],
      });
    });

    it('returns succeeded with an empty categories array when the batch has no category result at all', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockResolvedValue([
        {
          custom_id: 'en',
          result: {
            type: 'succeeded',
            message: toolUseMessage('Title EN', 'Content EN'),
          },
        },
        {
          custom_id: 'fr',
          result: {
            type: 'succeeded',
            message: toolUseMessage('Titre FR', 'Contenu FR'),
          },
        },
      ]);

      const result = await client.pollBatch('batch_123');

      expect(result).toMatchObject({ status: 'succeeded', categories: [] });
    });

    it('degrades to an empty categories array instead of failing the whole batch when the category result errored', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockResolvedValue([
        {
          custom_id: 'en',
          result: {
            type: 'succeeded',
            message: toolUseMessage('Title EN', 'Content EN'),
          },
        },
        {
          custom_id: 'fr',
          result: {
            type: 'succeeded',
            message: toolUseMessage('Titre FR', 'Contenu FR'),
          },
        },
        {
          custom_id: 'categories',
          result: {
            type: 'errored',
            error: { error: { type: 'overloaded_error', message: 'busy' } },
          },
        },
      ]);

      const result = await client.pollBatch('batch_123');

      expect(result).toMatchObject({ status: 'succeeded', categories: [] });
    });

    it('degrades to an empty categories array instead of failing the whole batch when the category tool call is malformed', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockResolvedValue([
        {
          custom_id: 'en',
          result: {
            type: 'succeeded',
            message: toolUseMessage('Title EN', 'Content EN'),
          },
        },
        {
          custom_id: 'fr',
          result: {
            type: 'succeeded',
            message: toolUseMessage('Titre FR', 'Contenu FR'),
          },
        },
        {
          custom_id: 'categories',
          result: {
            type: 'succeeded',
            message: { content: [{ type: 'text', text: 'no tool call' }] },
          },
        },
      ]);

      const result = await client.pollBatch('batch_123');

      expect(result).toMatchObject({ status: 'succeeded', categories: [] });
    });

    it('returns failed with the underlying Anthropic error message when a locale errored', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockResolvedValue([
        {
          custom_id: 'en',
          result: {
            type: 'succeeded',
            message: toolUseMessage('Title EN', 'Content EN'),
          },
        },
        {
          custom_id: 'fr',
          result: {
            type: 'errored',
            error: {
              error: { type: 'invalid_request_error', message: 'boom' },
            },
          },
        },
      ]);

      const result = await client.pollBatch('batch_123');

      expect(result).toEqual({
        status: 'failed',
        reason: 'fr: invalid_request_error: boom',
      });
    });

    it('returns failed instead of throwing when a succeeded result has a malformed/incomplete tool call', async () => {
      mockBatchesRetrieve.mockResolvedValue({ processing_status: 'ended' });
      mockBatchesResults.mockResolvedValue([
        {
          custom_id: 'en',
          result: {
            type: 'succeeded',
            // No tool_use block at all — e.g. the response was cut off by
            // max_tokens before the tool call was written.
            message: { content: [{ type: 'text', text: 'truncated...' }] },
          },
        },
        {
          custom_id: 'fr',
          result: {
            type: 'succeeded',
            message: toolUseMessage('Titre FR', 'Contenu FR'),
          },
        },
      ]);

      const result = await client.pollBatch('batch_123');

      expect(result.status).toBe('failed');
      expect((result as { reason: string }).reason).toContain('en:');
    });
  });
});
