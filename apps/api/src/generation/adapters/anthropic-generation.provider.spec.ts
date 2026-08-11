const mockCreate = jest.fn();
const mockBatchCreate = jest.fn();
const mockBatchRetrieve = jest.fn();
const mockBatchResults = jest.fn();
const mockAnthropicConstructor = jest.fn();

jest.mock('@anthropic-ai/sdk', () =>
  jest.fn().mockImplementation((options: unknown) => {
    mockAnthropicConstructor(options);
    return {
      messages: {
        create: mockCreate,
        batches: {
          create: mockBatchCreate,
          retrieve: mockBatchRetrieve,
          results: mockBatchResults,
        },
      },
    };
  }),
);

import { ConfigService } from '@nestjs/config';
import { AnthropicGenerationProvider } from './anthropic-generation.provider';

const outputSchema = {
  type: 'object',
  properties: { observations: { type: 'array' } },
  required: ['observations'],
  additionalProperties: false,
};

const request = {
  operationId: 'operation-1',
  attemptId: 'attempt-1',
  model: 'claude-sonnet-4-6',
  transport: 'sync' as const,
  parts: [
    { kind: 'text' as const, text: 'Extract facts.' },
    { kind: 'json' as const, value: { workingLanguage: 'fr' } },
    {
      kind: 'pdf' as const,
      data: Buffer.from('%PDF'),
      mimeType: 'application/pdf' as const,
    },
    {
      kind: 'image' as const,
      data: Buffer.from('image'),
      mimeType: 'image/png',
    },
  ],
  outputContract: 'observations-v1',
  outputSchema,
  correlationId: 'operation-1:attempt-1',
};

function message(output: unknown) {
  return {
    id: 'msg-1',
    _request_id: 'request-1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: [{ type: 'text', text: JSON.stringify(output) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 25,
      cache_read_input_tokens: 40,
      cache_creation_input_tokens: 10,
    },
  };
}

function asyncResults(items: unknown[]) {
  return Promise.resolve({
    [Symbol.asyncIterator]: async function* () {
      yield* items;
    },
  });
}

describe('AnthropicGenerationProvider', () => {
  let provider: AnthropicGenerationProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    const config = {
      get: jest
        .fn()
        .mockImplementation((key: string) =>
          key === 'ANTHROPIC_API_KEY' ? 'sk-ant-test-key' : undefined,
        ),
    } as unknown as ConfigService;
    provider = new AnthropicGenerationProvider(config);
  });

  it('disables SDK retries and maps text, JSON, PDF, image, schema, and correlation', async () => {
    mockCreate.mockResolvedValue(message({ observations: [] }));

    await expect(provider.submit(request)).resolves.toMatchObject({
      state: 'completed',
      result: {
        output: { observations: [] },
        providerCorrelationId: request.correlationId,
        providerRequestId: 'request-1',
      },
    });

    expect(mockAnthropicConstructor).toHaveBeenCalledWith({
      apiKey: 'sk-ant-test-key',
      maxRetries: 0,
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: request.model,
        metadata: { user_id: request.correlationId },
        output_config: {
          format: { type: 'json_schema', schema: outputSchema },
        },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract facts.' },
              { type: 'text', text: '{"workingLanguage":"fr"}' },
              expect.objectContaining({ type: 'document' }),
              expect.objectContaining({ type: 'image' }),
            ],
          },
        ],
      }),
    );
  });

  it('returns normalized Anthropic token usage', async () => {
    mockCreate.mockResolvedValue(message({ observations: [] }));

    const result = await provider.submit(request);

    expect(result).toMatchObject({
      state: 'completed',
      result: {
        usage: {
          inputTokens: 100,
          outputTokens: 25,
          cacheReadTokens: 40,
          cacheWriteTokens: 10,
        },
      },
    });
  });

  it('uses the SDK transformation for unsupported structured-output constraints', async () => {
    mockCreate.mockResolvedValue(message({ count: 1, kind: 'fact' }));
    const constrainedSchema = {
      type: 'object',
      additionalProperties: false,
      required: ['count', 'kind', 'locator'],
      properties: {
        count: { type: 'integer', minimum: 0 },
        kind: { const: 'fact' },
        locator: {
          oneOf: [
            { type: 'string', minLength: 1 },
            { type: 'integer', minimum: 1 },
          ],
        },
      },
    };

    await provider.submit({ ...request, outputSchema: constrainedSchema });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        output_config: {
          format: expect.objectContaining({
            type: 'json_schema',
            schema: expect.objectContaining({
              properties: {
                count: {
                  type: 'integer',
                  description: '{minimum: 0}',
                },
                kind: {
                  type: 'string',
                  description: '{const: "fact"}',
                },
                locator: {
                  anyOf: [
                    { type: 'string', description: '{minLength: 1}' },
                    { type: 'integer', description: '{minimum: 1}' },
                  ],
                },
              },
            }),
          }),
        },
      }),
    );
    expect(constrainedSchema.properties.count).toEqual({
      type: 'integer',
      minimum: 0,
    });
  });

  it('submits batch work and exposes a durable provider job id', async () => {
    mockBatchCreate.mockResolvedValue({ id: 'batch-1' });

    await expect(
      provider.submit({ ...request, transport: 'batch' }),
    ).resolves.toMatchObject({
      state: 'accepted',
      providerCorrelationId: request.correlationId,
      providerJobId: 'batch-1',
      nextPollAt: expect.any(Date),
    });
    expect(mockBatchCreate).toHaveBeenCalledWith({
      requests: [
        expect.objectContaining({
          custom_id: request.attemptId,
          params: expect.objectContaining({ model: request.model }),
        }),
      ],
    });
  });

  it('polls pending batches without reading their results', async () => {
    mockBatchRetrieve.mockResolvedValue({ processing_status: 'in_progress' });

    await expect(
      provider.poll({
        operationId: request.operationId,
        attemptId: request.attemptId,
        model: request.model,
        providerJobId: 'batch-1',
      }),
    ).resolves.toMatchObject({
      state: 'pending',
      nextPollAt: expect.any(Date),
    });
    expect(mockBatchResults).not.toHaveBeenCalled();
  });

  it('reads the matching completed batch result and normalizes usage', async () => {
    mockBatchRetrieve.mockResolvedValue({ processing_status: 'ended' });
    mockBatchResults.mockReturnValue(
      asyncResults([
        {
          custom_id: request.attemptId,
          result: {
            type: 'succeeded',
            message: message({ observations: [{ sequence: 0 }] }),
          },
        },
      ]),
    );

    await expect(
      provider.poll({
        operationId: request.operationId,
        attemptId: request.attemptId,
        model: request.model,
        providerJobId: 'batch-1',
        providerCorrelationId: request.correlationId,
      }),
    ).resolves.toMatchObject({
      state: 'completed',
      result: {
        output: { observations: [{ sequence: 0 }] },
        usage: { inputTokens: 100, outputTokens: 25 },
      },
    });
  });

  it('fails safely when a structured output contract is missing or invalid', async () => {
    await expect(
      provider.submit({ ...request, outputSchema: undefined }),
    ).resolves.toMatchObject({
      state: 'failed',
      failure: { code: 'ANTHROPIC_OUTPUT_SCHEMA_MISSING', retryable: false },
    });

    mockCreate.mockResolvedValue({
      ...message({}),
      content: [{ type: 'text', text: 'not-json' }],
    });
    await expect(provider.submit(request)).resolves.toMatchObject({
      state: 'failed',
      failure: { code: 'ANTHROPIC_INVALID_OUTPUT', retryable: true },
    });
  });

  // A Notion page spent all 16k output tokens reasoning and returned a single
  // thinking block, no text. Reported as invalid output that reads as a broken
  // schema or a broken prompt; it was neither, the budget was simply too small.
  // Extraction asks for `low`: the stage is mechanical and the reasoning was
  // what ate the budget. A stage that says nothing keeps the model's own choice.
  it('passes a stage effort through to the model, and omits it when unset', async () => {
    mockCreate.mockResolvedValue(message({ observations: [] }));

    await provider.submit({ ...request, effort: 'low' });
    expect(mockCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        output_config: expect.objectContaining({ effort: 'low' }),
      }),
    );

    await provider.submit(request);
    expect(mockCreate.mock.calls.at(-1)?.[0].output_config).not.toHaveProperty(
      'effort',
    );
  });

  it('names a truncated answer for what it is rather than calling it invalid', async () => {
    mockCreate.mockResolvedValue({
      ...message({}),
      content: [{ type: 'thinking', thinking: '', signature: 'sig' }],
      stop_reason: 'max_tokens',
    });

    await expect(provider.submit(request)).resolves.toMatchObject({
      state: 'failed',
      failure: { code: 'ANTHROPIC_OUTPUT_TRUNCATED', retryable: true },
    });
  });

  it('fails closed without credentials for both submission and polling', async () => {
    const disabled = new AnthropicGenerationProvider({
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService);
    await expect(disabled.submit(request)).resolves.toMatchObject({
      state: 'failed',
      failure: { code: 'ANTHROPIC_CREDENTIAL_MISSING', retryable: false },
    });
    await expect(
      disabled.poll({
        operationId: 'operation-1',
        attemptId: 'attempt-1',
        model: request.model,
        providerJobId: 'batch-1',
      }),
    ).resolves.toMatchObject({
      state: 'failed',
      failure: { code: 'ANTHROPIC_CREDENTIAL_MISSING' },
    });
  });

  it('normalizes sync and polling transport failures', async () => {
    mockCreate.mockRejectedValueOnce(
      Object.assign(new Error('rate limited'), { status: 429 }),
    );
    await expect(provider.submit(request)).resolves.toMatchObject({
      state: 'failed',
      failure: { httpStatus: 429, retryable: true },
    });

    // A 503 means we never got to read the batch, so the batch is untouched
    // and worth reading again. Reporting that as a failed job would have spent
    // one of two attempts on somebody else's outage.
    mockBatchRetrieve.mockRejectedValueOnce(
      Object.assign(new Error('unavailable'), { status: 503 }),
    );
    await expect(
      provider.poll({
        operationId: request.operationId,
        attemptId: request.attemptId,
        model: request.model,
        providerJobId: 'batch-1',
      }),
    ).resolves.toMatchObject({
      state: 'unreadable',
      failure: { httpStatus: 503, retryable: true },
    });
  });

  it('rejects unsupported image media as an adapter failure', async () => {
    await expect(
      provider.submit({
        ...request,
        parts: [
          {
            kind: 'image',
            data: Buffer.from('gif'),
            mimeType: 'image/gif',
          },
        ],
      }),
    ).resolves.toMatchObject({
      state: 'failed',
      failure: { errorClass: 'invalid_request', retryable: false },
    });
  });

  it.each([
    ['errored', 'provider_terminal', true],
    ['expired', 'transient', false],
  ])('maps a %s batch result', async (type, errorClass, retryable) => {
    mockBatchRetrieve.mockResolvedValue({ processing_status: 'ended' });
    mockBatchResults.mockReturnValue(
      asyncResults([
        {
          custom_id: 'another-attempt',
          result: { type: 'succeeded', message: message({}) },
        },
        { custom_id: request.attemptId, result: { type } },
      ]),
    );
    await expect(
      provider.poll({
        operationId: request.operationId,
        attemptId: request.attemptId,
        model: request.model,
        providerJobId: 'batch-1',
      }),
    ).resolves.toMatchObject({
      state: 'failed',
      failure: { errorClass, retryable },
    });
  });

  it('reports a missing matching result and falls back to the message id', async () => {
    mockBatchRetrieve.mockResolvedValue({ processing_status: 'ended' });
    mockBatchResults.mockReturnValue(asyncResults([]));
    await expect(
      provider.poll({
        operationId: request.operationId,
        attemptId: request.attemptId,
        model: request.model,
        providerJobId: 'batch-1',
      }),
    ).resolves.toMatchObject({
      failure: { code: 'ANTHROPIC_BATCH_RESULT_MISSING' },
    });

    const withoutRequestId = message({ observations: [] });
    delete (withoutRequestId as { _request_id?: string })._request_id;
    withoutRequestId.usage.cache_read_input_tokens = undefined as never;
    withoutRequestId.usage.cache_creation_input_tokens = undefined as never;
    withoutRequestId.content.unshift({ type: 'tool_use' } as never);
    mockCreate.mockResolvedValue(withoutRequestId);
    await expect(provider.submit(request)).resolves.toMatchObject({
      result: {
        providerRequestId: 'msg-1',
        usage: { cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    });
  });
});
