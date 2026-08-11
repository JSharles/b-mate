import { GenerationProviderAdapter } from './adapters/generation-provider';
import { GenerationHandlerRegistry } from './generation-handler.registry';
import { GenerationPolicyService } from './policy/generation-policy.service';
import { GenerationService } from './generation.service';
import { GenerationWorkerService } from './generation-worker.service';

const operation = {
  id: '00000000-0000-4000-8000-000000000001',
  projectId: '00000000-0000-4000-8000-000000000002',
  type: 'document_extraction',
  status: 'running',
  currentRouteIndex: 0,
  currentAttemptId: null,
  policySnapshot: {
    version: 'test-v1',
    stage: 'document_extraction',
    crossProviderFallbackEnabled: false,
    routes: [
      {
        provider: 'fake',
        model: 'deterministic-v1',
        transport: 'sync',
        maxAttempts: 2,
        requestTimeoutMs: 30_000,
        remoteDeadlineMs: 120_000,
      },
    ],
  },
};

describe('GenerationWorkerService', () => {
  let generation: jest.Mocked<
    Pick<
      GenerationService,
      | 'leaseNext'
      | 'startAttempt'
      | 'markSubmitted'
      | 'markPolling'
      | 'applySuccessfulResult'
      | 'recordAttemptFailure'
      | 'abandonUnknown'
    >
  >;
  let policy: jest.Mocked<
    Pick<GenerationPolicyService, 'isCurrentlyPermitted'>
  >;
  let handlers: jest.Mocked<Pick<GenerationHandlerRegistry, 'get'>>;
  let provider: jest.Mocked<GenerationProviderAdapter>;
  let worker: GenerationWorkerService;

  beforeEach(() => {
    generation = {
      leaseNext: jest.fn().mockResolvedValue(operation),
      startAttempt: jest.fn().mockResolvedValue({ id: 'attempt-1' }),
      markSubmitted: jest.fn(),
      markPolling: jest.fn(),
      applySuccessfulResult: jest.fn(),
      recordAttemptFailure: jest.fn(),
      abandonUnknown: jest.fn(),
    };
    policy = { isCurrentlyPermitted: jest.fn().mockReturnValue(true) };
    handlers = {
      get: jest.fn().mockReturnValue({
        buildRequest: jest.fn().mockResolvedValue({
          parts: [{ kind: 'text', text: 'input' }],
          outputContract: 'observations-v1',
        }),
        apply: jest.fn(),
      }),
    };
    provider = {
      key: 'fake',
      submit: jest.fn().mockResolvedValue({
        state: 'completed',
        result: { output: { claims: [] } },
      }),
      poll: jest.fn(),
    };
    worker = new GenerationWorkerService(
      generation as unknown as GenerationService,
      policy as unknown as GenerationPolicyService,
      handlers as unknown as GenerationHandlerRegistry,
      [provider],
    );
  });

  it('runs a sync attempt from lease through guarded terminal application', async () => {
    await worker.tick();

    expect(generation.leaseNext).toHaveBeenCalledTimes(1);
    expect(generation.startAttempt).toHaveBeenCalledWith(
      operation,
      operation.policySnapshot.routes[0],
    );
    expect(provider.submit.mock.calls).toHaveLength(1);
    expect(provider.submit.mock.calls[0]?.[0]).toMatchObject({
      operationId: operation.id,
    });
    expect(generation.applySuccessfulResult).toHaveBeenCalledWith(
      operation.id,
      'attempt-1',
      { output: { claims: [] } },
    );
  });

  it('records remote acceptance and polls the current attempt on a later tick', async () => {
    provider.submit.mockResolvedValueOnce({
      state: 'accepted',
      providerCorrelationId: 'correlation-1',
      providerJobId: 'job-1',
      nextPollAt: new Date('2026-08-11T12:00:05.000Z'),
    });
    await worker.tick();
    expect(generation.markSubmitted).toHaveBeenCalledWith(
      operation.id,
      'attempt-1',
      expect.objectContaining({ providerJobId: 'job-1' }),
    );

    generation.leaseNext.mockResolvedValueOnce({
      ...operation,
      currentAttemptId: 'attempt-1',
      currentAttempt: {
        id: 'attempt-1',
        provider: 'fake',
        providerJobId: 'job-1',
        status: 'submitted',
      },
    } as never);
    provider.poll.mockResolvedValueOnce({
      state: 'completed',
      result: { output: { claims: ['done'] } },
    });
    await worker.tick();

    expect(provider.poll.mock.calls).toHaveLength(1);
    expect(generation.applySuccessfulResult).toHaveBeenCalledWith(
      operation.id,
      'attempt-1',
      { output: { claims: ['done'] } },
    );
  });

  it('does not submit a route denied by the current operator policy', async () => {
    policy.isCurrentlyPermitted.mockReturnValue(false);

    await worker.tick();

    expect(provider.submit.mock.calls).toHaveLength(0);
    expect(generation.recordAttemptFailure).toHaveBeenCalledWith(
      operation,
      null,
      expect.objectContaining({ errorClass: 'policy_denied' }),
    );
  });

  it('normalizes provider failures into the durable retry path', async () => {
    provider.submit.mockRejectedValue(new Error('provider unavailable'));

    await worker.tick();

    expect(generation.recordAttemptFailure).toHaveBeenCalledWith(
      operation,
      'attempt-1',
      expect.objectContaining({ errorClass: 'unknown', retryable: true }),
    );
  });

  it('does nothing when no operation is due or a prior tick is still active', async () => {
    generation.leaseNext.mockResolvedValueOnce(null);
    await worker.tick();
    expect(generation.startAttempt).not.toHaveBeenCalled();

    let releaseLease: ((value: null) => void) | undefined;
    generation.leaseNext.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseLease = resolve;
        }),
    );
    const firstTick = worker.tick();
    await Promise.resolve();
    await worker.tick();
    expect(generation.leaseNext).toHaveBeenCalledTimes(2);
    releaseLease?.(null);
    await firstTick;
  });

  it('fails closed for an invalid frozen policy snapshot', async () => {
    generation.leaseNext.mockResolvedValueOnce({
      ...operation,
      policySnapshot: { routes: [] },
    } as never);

    await worker.tick();

    expect(generation.recordAttemptFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: operation.id }),
      null,
      expect.objectContaining({
        code: 'GENERATION_POLICY_SNAPSHOT_INVALID',
        retryable: false,
      }),
    );
  });

  it('records an unavailable adapter without submitting data', async () => {
    worker = new GenerationWorkerService(
      generation as unknown as GenerationService,
      policy as unknown as GenerationPolicyService,
      handlers as unknown as GenerationHandlerRegistry,
      [],
    );

    await worker.tick();

    expect(generation.recordAttemptFailure).toHaveBeenCalledWith(
      operation,
      null,
      expect.objectContaining({
        code: 'GENERATION_PROVIDER_UNAVAILABLE',
      }),
    );
  });

  it('handles provider-declared submit failure without applying output', async () => {
    provider.submit.mockResolvedValueOnce({
      state: 'failed',
      failure: {
        errorClass: 'rate_limited',
        code: 'RATE_LIMITED',
        retryable: true,
      },
    });

    await worker.tick();

    expect(generation.recordAttemptFailure).toHaveBeenCalledWith(
      operation,
      'attempt-1',
      expect.objectContaining({ code: 'RATE_LIMITED' }),
    );
    expect(generation.applySuccessfulResult).not.toHaveBeenCalled();
  });

  it('rejects polling without a provider job id', async () => {
    generation.leaseNext.mockResolvedValueOnce({
      ...operation,
      currentAttemptId: 'attempt-1',
      currentAttempt: {
        id: 'attempt-1',
        provider: 'fake',
        transport: 'batch',
        providerJobId: null,
        status: 'submitted',
      },
    } as never);

    await worker.tick();

    expect(provider.poll.mock.calls).toHaveLength(0);
    expect(generation.recordAttemptFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: operation.id }),
      'attempt-1',
      expect.objectContaining({ code: 'GENERATION_PROVIDER_JOB_MISSING' }),
    );
  });

  it('requeues an interrupted sync attempt instead of trying to poll it', async () => {
    generation.leaseNext.mockResolvedValueOnce({
      ...operation,
      currentAttemptId: 'attempt-1',
      currentAttempt: {
        id: 'attempt-1',
        provider: 'fake',
        transport: 'sync',
        providerJobId: null,
        status: 'running',
      },
    } as never);

    await worker.tick();

    expect(provider.poll).not.toHaveBeenCalled();
    expect(generation.recordAttemptFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: operation.id }),
      'attempt-1',
      expect.objectContaining({
        code: 'GENERATION_SYNC_ATTEMPT_INTERRUPTED',
        retryable: true,
      }),
    );
  });

  it('persists pending polls and provider-declared poll failures', async () => {
    const pollingOperation = {
      ...operation,
      currentAttemptId: 'attempt-1',
      currentAttempt: {
        id: 'attempt-1',
        provider: 'fake',
        model: 'deterministic-v1',
        transport: 'batch',
        providerJobId: 'job-1',
        providerCorrelationId: null,
        providerRequestId: null,
        status: 'submitted',
      },
    };
    generation.leaseNext.mockResolvedValueOnce(pollingOperation as never);
    const nextPollAt = new Date('2026-08-11T12:00:10.000Z');
    provider.poll.mockResolvedValueOnce({ state: 'pending', nextPollAt });
    await worker.tick();
    expect(generation.markPolling).toHaveBeenCalledWith(
      operation.id,
      'attempt-1',
      nextPollAt,
    );

    generation.leaseNext.mockResolvedValueOnce(pollingOperation as never);
    provider.poll.mockResolvedValueOnce({
      state: 'failed',
      failure: {
        errorClass: 'provider_terminal',
        code: 'REMOTE_FAILED',
        retryable: false,
      },
    });
    await worker.tick();
    expect(generation.recordAttemptFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: operation.id }),
      'attempt-1',
      expect.objectContaining({ code: 'REMOTE_FAILED' }),
    );
  });

  // A finished job returns the same thing every time it is read, so re-reading
  // it after a bad result is not a retry — it is a loop. A Notion page whose
  // extraction came back truncated was polled every five seconds for a quarter
  // of an hour, and would have kept going for the full 24h remote deadline,
  // with the document stuck on "processing" and nothing reported anywhere.
  it('spends an attempt on a retryable poll failure instead of re-reading the job', async () => {
    generation.leaseNext.mockResolvedValueOnce({
      ...operation,
      currentAttemptId: 'attempt-1',
      currentAttempt: {
        id: 'attempt-1',
        provider: 'fake',
        model: 'deterministic-v1',
        transport: 'batch',
        providerJobId: 'job-1',
        providerCorrelationId: null,
        providerRequestId: null,
        status: 'submitted',
      },
    } as never);
    provider.poll.mockResolvedValueOnce({
      state: 'failed',
      failure: {
        errorClass: 'invalid_output',
        code: 'ANTHROPIC_OUTPUT_TRUNCATED',
        retryable: true,
      },
    });

    await worker.tick();

    expect(generation.markPolling).not.toHaveBeenCalled();
    expect(generation.recordAttemptFailure).toHaveBeenCalledWith(
      expect.objectContaining({ id: operation.id }),
      'attempt-1',
      expect.objectContaining({ code: 'ANTHROPIC_OUTPUT_TRUNCATED' }),
    );
  });

  // The other half of the same rule: when the job could not be read at all the
  // job is untouched, and burning one of two attempts on a 429 would be wrong.
  it('re-reads a job it could not reach, without spending an attempt', async () => {
    generation.leaseNext.mockResolvedValueOnce({
      ...operation,
      currentAttemptId: 'attempt-1',
      currentAttempt: {
        id: 'attempt-1',
        provider: 'fake',
        model: 'deterministic-v1',
        transport: 'batch',
        providerJobId: 'job-1',
        providerCorrelationId: null,
        providerRequestId: null,
        status: 'submitted',
      },
    } as never);
    provider.poll.mockResolvedValueOnce({
      state: 'unreadable',
      failure: {
        errorClass: 'transient',
        code: 'ANTHROPIC_RATE_LIMITED',
        retryable: true,
      },
    });

    await worker.tick();

    expect(generation.recordAttemptFailure).not.toHaveBeenCalled();
    expect(generation.markPolling).toHaveBeenCalledWith(
      operation.id,
      'attempt-1',
      expect.any(Date),
    );
  });
});
