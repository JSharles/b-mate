import { FakeGenerationProvider } from './fake-generation.provider';

const request = {
  operationId: 'operation-1',
  attemptId: 'attempt-1',
  model: 'deterministic-v1',
  transport: 'sync' as const,
  parts: [{ kind: 'text' as const, text: 'stable input' }],
  outputContract: 'fixture-v1',
  outputSchema: { type: 'object', additionalProperties: true },
  correlationId: 'operation-1:attempt-1',
};

describe('FakeGenerationProvider', () => {
  it('returns deterministic sync output and normalized usage', async () => {
    const provider = new FakeGenerationProvider();

    const first = await provider.submit(request);
    const second = await provider.submit(request);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      state: 'completed',
      result: {
        output: { fixture: 'deterministic-fake' },
        usage: {
          outputTokens: 16,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      },
    });
  });

  it('accepts batch work and returns the same deterministic result on poll', async () => {
    const provider = new FakeGenerationProvider();
    const accepted = await provider.submit({ ...request, transport: 'batch' });

    expect(accepted.state).toBe('accepted');
    if (accepted.state !== 'accepted') {
      throw new Error('Expected a fake batch job.');
    }
    await expect(
      provider.poll({
        operationId: request.operationId,
        attemptId: request.attemptId,
        model: request.model,
        providerJobId: accepted.providerJobId,
      }),
    ).resolves.toMatchObject({
      state: 'completed',
      result: { output: { fixture: 'deterministic-fake' } },
    });
  });

  it('supports explicit fixtures and fails unknown batch jobs safely', async () => {
    const provider = new FakeGenerationProvider();
    provider.setResult(request.operationId, {
      output: { claims: ['fixture'] },
    });
    await expect(provider.submit(request)).resolves.toEqual({
      state: 'completed',
      result: { output: { claims: ['fixture'] } },
    });
    await expect(
      provider.poll({
        operationId: request.operationId,
        attemptId: request.attemptId,
        model: request.model,
        providerJobId: 'missing',
      }),
    ).resolves.toMatchObject({
      state: 'failed',
      failure: { code: 'FAKE_JOB_NOT_FOUND', retryable: false },
    });
  });
});
