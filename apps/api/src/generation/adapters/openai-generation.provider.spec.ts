const mockCreate = jest.fn();
const mockRetrieve = jest.fn();
const mockConstructor = jest.fn();
jest.mock('openai', () =>
  jest.fn().mockImplementation((options: unknown) => {
    mockConstructor(options);
    return { responses: { create: mockCreate, retrieve: mockRetrieve } };
  }),
);
import { ConfigService } from '@nestjs/config';
import { OpenAIGenerationProvider } from './openai-generation.provider';
const request = {
  operationId: 'op',
  attemptId: 'attempt',
  model: 'gpt-test',
  transport: 'sync' as const,
  parts: [
    { kind: 'text' as const, text: 'hello' },
    { kind: 'json' as const, value: { a: 1 } },
    {
      kind: 'pdf' as const,
      data: Buffer.from('pdf'),
      mimeType: 'application/pdf' as const,
    },
    { kind: 'image' as const, data: Buffer.from('img'), mimeType: 'image/png' },
  ],
  outputContract: 'v1',
  outputSchema: { type: 'object' },
  correlationId: 'op:attempt',
};
function response(status: string, output = '{"ok":true}') {
  return {
    id: 'resp-1',
    status,
    output_text: output,
    usage: {
      input_tokens: 10,
      output_tokens: 2,
      input_tokens_details: { cached_tokens: 3, cache_write_tokens: 1 },
      output_tokens_details: {},
    },
  };
}
describe('OpenAIGenerationProvider', () => {
  let provider: OpenAIGenerationProvider;
  beforeEach(() => {
    jest.clearAllMocks();
    provider = new OpenAIGenerationProvider({
      get: jest.fn((key: string) =>
        key === 'OPENAI_API_KEY' ? 'sk-test-key' : undefined,
      ),
    } as unknown as ConfigService);
  });
  it('submits all input kinds with strict structured output and no SDK retries', async () => {
    mockCreate.mockResolvedValue(response('completed'));
    await expect(provider.submit(request)).resolves.toMatchObject({
      state: 'completed',
      result: { output: { ok: true }, usage: { cacheReadTokens: 3 } },
    });
    expect(mockConstructor).toHaveBeenCalledWith({
      apiKey: 'sk-test-key',
      maxRetries: 0,
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        store: false,
        background: false,
        text: {
          format: expect.objectContaining({
            type: 'json_schema',
            strict: true,
          }),
        },
      }),
    );
  });
  it('submits background work and polls until complete', async () => {
    mockCreate.mockResolvedValue(response('queued'));
    await expect(
      provider.submit({ ...request, transport: 'batch' }),
    ).resolves.toMatchObject({ state: 'accepted', providerJobId: 'resp-1' });
    mockRetrieve
      .mockResolvedValueOnce(response('in_progress'))
      .mockResolvedValueOnce(response('completed'));
    await expect(
      provider.poll({
        operationId: 'op',
        attemptId: 'attempt',
        model: 'gpt-test',
        providerJobId: 'resp-1',
      }),
    ).resolves.toMatchObject({ state: 'pending' });
    await expect(
      provider.poll({
        operationId: 'op',
        attemptId: 'attempt',
        model: 'gpt-test',
        providerJobId: 'resp-1',
      }),
    ).resolves.toMatchObject({ state: 'completed' });
  });
  it.each(['failed', 'cancelled', 'incomplete'])(
    'normalizes terminal status %s',
    async (status) => {
      mockCreate.mockResolvedValue(response(status));
      await expect(provider.submit(request)).resolves.toMatchObject({
        state: 'failed',
      });
    },
  );
  it('rejects invalid JSON and provider errors', async () => {
    mockCreate
      .mockResolvedValueOnce(response('completed', 'not-json'))
      .mockRejectedValueOnce({ status: 429 });
    await expect(provider.submit(request)).resolves.toMatchObject({
      state: 'failed',
      failure: { errorClass: 'invalid_output' },
    });
    await expect(provider.submit(request)).resolves.toMatchObject({
      state: 'failed',
      failure: { errorClass: 'rate_limited' },
    });
  });
  it('fails closed without credentials or schema', async () => {
    const missing = new OpenAIGenerationProvider({
      get: jest.fn(),
    } as unknown as ConfigService);
    await expect(missing.submit(request)).resolves.toMatchObject({
      state: 'failed',
    });
    await expect(
      missing.poll({
        operationId: 'op',
        attemptId: 'a',
        model: 'm',
        providerJobId: 'j',
      }),
    ).resolves.toMatchObject({ state: 'failed' });
    await expect(
      provider.submit({ ...request, outputSchema: undefined }),
    ).resolves.toMatchObject({
      state: 'failed',
      failure: { errorClass: 'invalid_request' },
    });
  });
});
