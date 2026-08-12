import {
  asPrismaService,
  createPrismaMock,
  PrismaMock,
} from '../test/prisma-mock';
import { GenerationHandlerRegistry } from './generation-handler.registry';
import { GenerationPolicyService } from './policy/generation-policy.service';
import type { GenerationProviderAdapter } from './adapters/generation-provider';
import { GenerationService } from './generation.service';

const now = new Date('2026-08-11T12:00:00.000Z');
const operation = {
  id: '00000000-0000-4000-8000-000000000001',
  projectId: '00000000-0000-4000-8000-000000000002',
  type: 'document_extraction',
  status: 'queued',
  deduplicationKey: 'document:1:extract:v1',
  inputFingerprint: 'a'.repeat(64),
  policySnapshot: {
    version: 'test-v1',
    stage: 'document_extraction',
    crossProviderFallbackEnabled: false,
    routes: [],
  },
  currentRouteIndex: 0,
  currentAttemptId: null,
  leaseOwner: null,
  leaseExpiresAt: null,
};

describe('GenerationService', () => {
  let prisma: PrismaMock;
  let policy: jest.Mocked<Pick<GenerationPolicyService, 'snapshotFor'>>;
  let handlers: jest.Mocked<Pick<GenerationHandlerRegistry, 'get'>>;
  let provider: jest.Mocked<
    Pick<GenerationProviderAdapter, 'key' | 'submit' | 'poll' | 'cancelRemote'>
  >;
  let service: GenerationService;

  beforeEach(() => {
    prisma = createPrismaMock();
    policy = {
      snapshotFor: jest.fn().mockReturnValue(operation.policySnapshot),
    };
    handlers = { get: jest.fn() };
    provider = {
      key: 'fake',
      submit: jest.fn(),
      poll: jest.fn(),
      cancelRemote: jest.fn(),
    };
    service = new GenerationService(
      asPrismaService(prisma),
      policy as unknown as GenerationPolicyService,
      handlers as unknown as GenerationHandlerRegistry,
      [provider],
    );
  });

  it('deduplicates operation creation while freezing the stage policy', async () => {
    prisma.generationOperation.upsert.mockResolvedValue(operation);

    await expect(
      service.create({
        projectId: operation.projectId,
        type: 'document_extraction',
        deduplicationKey: operation.deduplicationKey,
        inputFingerprint: operation.inputFingerprint,
        promptVersion: 'extract-v1',
        outputContractVersion: 'observations-v1',
        sourceDocumentId: '00000000-0000-4000-8000-000000000003',
      }),
    ).resolves.toEqual(operation);

    expect(policy.snapshotFor).toHaveBeenCalledWith('document_extraction');
    const upsertCalls = prisma.generationOperation.upsert.mock
      .calls as unknown[][];
    expect(upsertCalls[0]?.[0]).toMatchObject({
      where: { deduplicationKey: operation.deduplicationKey },
      update: {},
      create: {
        policySnapshot: operation.policySnapshot,
        status: 'queued',
      },
    });
  });

  it('conditionally leases queued work and recovers an expired lease', async () => {
    prisma.generationOperation.findFirst.mockResolvedValue({
      ...operation,
      status: 'running',
      leaseOwner: 'dead-worker',
      leaseExpiresAt: new Date('2026-08-11T11:59:00.000Z'),
    });
    prisma.generationOperation.updateMany.mockResolvedValue({ count: 1 });
    prisma.generationOperation.findUnique.mockResolvedValue({
      ...operation,
      status: 'running',
      leaseOwner: 'worker-2',
    });

    await expect(service.leaseNext('worker-2', now)).resolves.toMatchObject({
      leaseOwner: 'worker-2',
    });
    const leaseCalls = prisma.generationOperation.updateMany.mock
      .calls as unknown[][];
    expect(leaseCalls[0]?.[0]).toMatchObject({
      where: {
        id: operation.id,
        OR: [
          { leaseExpiresAt: null },
          { leaseExpiresAt: { lte: now } },
          { leaseOwner: 'worker-2' },
        ],
      },
      data: { status: 'running', leaseOwner: 'worker-2' },
    });
  });

  it('returns no lease when another worker wins the conditional update', async () => {
    prisma.generationOperation.findFirst.mockResolvedValue(operation);
    prisma.generationOperation.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.leaseNext('worker-2', now)).resolves.toBeNull();
    expect(prisma.generationOperation.findUnique).not.toHaveBeenCalled();
  });

  it('returns no lease when no operation is due', async () => {
    prisma.generationOperation.findFirst.mockResolvedValue(null);

    await expect(service.leaseNext('worker-2', now)).resolves.toBeNull();
    expect(prisma.generationOperation.updateMany).not.toHaveBeenCalled();
  });

  it('creates an ordinal attempt and claims it as current atomically', async () => {
    prisma.generationAttempt.count.mockResolvedValue(2);
    prisma.generationAttempt.create.mockResolvedValue({ id: 'attempt-3' });
    prisma.generationOperation.updateMany.mockResolvedValue({ count: 1 });
    const route = {
      provider: 'fake' as const,
      model: 'deterministic-v1',
      transport: 'sync' as const,
      maxAttempts: 2,
      requestTimeoutMs: 30_000,
      remoteDeadlineMs: 120_000,
    };

    await expect(
      service.startAttempt(operation as never, route),
    ).resolves.toEqual({ id: 'attempt-3' });
    const attemptCalls = prisma.generationAttempt.create.mock
      .calls as unknown[][];
    expect(attemptCalls[0]?.[0]).toMatchObject({
      data: { ordinal: 3, routeIndex: 0, provider: 'fake' },
    });
  });

  it('rolls back an attempt when the operation can no longer claim it', async () => {
    prisma.generationAttempt.count.mockResolvedValue(0);
    prisma.generationAttempt.create.mockResolvedValue({ id: 'attempt-1' });
    prisma.generationOperation.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.startAttempt(operation as never, {
        provider: 'fake',
        model: 'deterministic-v1',
        transport: 'sync',
        maxAttempts: 1,
        requestTimeoutMs: 30_000,
        remoteDeadlineMs: 120_000,
      }),
    ).rejects.toThrow('no longer available');
  });

  it('records remote submission and schedules polling', async () => {
    prisma.generationOperation.updateMany.mockResolvedValue({ count: 1 });
    const nextPollAt = new Date('2026-08-11T12:00:05.000Z');

    await service.markSubmitted(operation.id, 'attempt-1', {
      state: 'accepted',
      providerCorrelationId: 'correlation-1',
      providerJobId: 'job-1',
      nextPollAt,
    });
    expect(prisma.generationAttempt.update).toHaveBeenCalled();
    const operationCalls = prisma.generationOperation.updateMany.mock
      .calls as unknown[][];
    expect(operationCalls[0]?.[0]).toMatchObject({
      data: {
        status: 'waiting_provider',
        runAfter: nextPollAt,
        leaseOwner: null,
      },
    });
  });

  it('rejects a submitted attempt that stopped being current', async () => {
    prisma.generationOperation.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.markSubmitted(operation.id, 'attempt-1', {
        state: 'accepted',
        providerJobId: 'job-1',
        nextPollAt: now,
      }),
    ).rejects.toThrow('no longer current');
  });

  it('persists polling state and releases the worker lease', async () => {
    await service.markPolling(operation.id, 'attempt-1', now);

    expect(prisma.generationAttempt.updateMany).toHaveBeenCalled();
    const pollingCalls = prisma.generationOperation.updateMany.mock
      .calls as unknown[][];
    expect(pollingCalls[0]?.[0]).toMatchObject({
      data: { status: 'waiting_provider', runAfter: now, leaseOwner: null },
    });
  });

  it('retries the same route, advances fallback, then reaches attention', async () => {
    const onTerminalFailure = jest.fn().mockResolvedValue(undefined);
    handlers.get.mockReturnValue({ onTerminalFailure } as never);
    prisma.generationOperation.updateMany.mockResolvedValue({ count: 1 });
    const withRoutes = {
      ...operation,
      policySnapshot: {
        ...operation.policySnapshot,
        routes: [
          {
            provider: 'fake',
            model: 'primary',
            transport: 'sync',
            maxAttempts: 2,
            requestTimeoutMs: 30_000,
            remoteDeadlineMs: 120_000,
          },
          {
            provider: 'fake',
            model: 'fallback',
            transport: 'sync',
            maxAttempts: 1,
            requestTimeoutMs: 30_000,
            remoteDeadlineMs: 120_000,
          },
        ],
      },
    };
    prisma.generationAttempt.count.mockResolvedValueOnce(1);
    await service.recordAttemptFailure(withRoutes as never, 'attempt-1', {
      errorClass: 'transient',
      code: 'TEMPORARY',
      retryable: true,
    });
    let calls = prisma.generationOperation.updateMany.mock.calls as unknown[][];
    expect(calls[0]?.[0]).toMatchObject({
      data: { status: 'retry_scheduled', currentRouteIndex: 0 },
    });

    prisma.generationOperation.updateMany.mockClear();
    prisma.generationAttempt.count.mockResolvedValueOnce(2);
    await service.recordAttemptFailure(withRoutes as never, 'attempt-2', {
      errorClass: 'rate_limited',
      code: 'RATE_LIMITED',
      retryable: true,
    });
    calls = prisma.generationOperation.updateMany.mock.calls as unknown[][];
    expect(calls[0]?.[0]).toMatchObject({
      data: { status: 'retry_scheduled', currentRouteIndex: 1 },
    });

    prisma.generationOperation.updateMany.mockClear();
    prisma.generationAttempt.count.mockResolvedValueOnce(1);
    await service.recordAttemptFailure(
      { ...withRoutes, currentRouteIndex: 1 } as never,
      'attempt-3',
      {
        errorClass: 'provider_terminal',
        code: 'EXHAUSTED',
        retryable: false,
        protectedDiagnostic: 'x'.repeat(3000),
      },
    );
    calls = prisma.generationOperation.updateMany.mock.calls as unknown[][];
    expect(calls[0]?.[0]).toMatchObject({
      data: {
        status: 'needs_attention',
        terminalFailureCode: 'EXHAUSTED',
      },
    });
    expect(onTerminalFailure).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ id: operation.id }),
      'EXHAUSTED',
    );
  });

  it('cancels queued work before any attempt is submitted', async () => {
    prisma.generationOperation.findUnique.mockResolvedValue(operation);
    prisma.generationOperation.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.cancel(operation.id)).resolves.toEqual({
      cancelled: true,
      remoteAccepted: false,
    });
    expect(prisma.generationAttempt.updateMany).not.toHaveBeenCalled();
    const cancelCalls = prisma.generationOperation.updateMany.mock
      .calls as unknown[][];
    expect(cancelCalls[0]?.[0]).toMatchObject({
      data: { status: 'cancelled' },
    });
  });

  it('cancels after remote acceptance without erasing the submitted attempt', async () => {
    prisma.generationOperation.findUnique.mockResolvedValue({
      ...operation,
      status: 'waiting_provider',
      currentAttemptId: '00000000-0000-4000-8000-000000000004',
      currentAttempt: {
        id: '00000000-0000-4000-8000-000000000004',
        status: 'submitted',
        providerJobId: 'remote-job-1',
      },
    });
    prisma.generationOperation.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.cancel(operation.id)).resolves.toEqual({
      cancelled: true,
      remoteAccepted: true,
    });
    expect(prisma.generationAttempt.updateMany).not.toHaveBeenCalled();
  });

  it('marks a not-yet-accepted current attempt cancelled and is idempotent when terminal', async () => {
    prisma.generationOperation.findUnique.mockResolvedValueOnce({
      ...operation,
      status: 'running',
      currentAttempt: { id: 'attempt-1', status: 'submitting' },
    });
    prisma.generationOperation.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.cancel(operation.id)).resolves.toMatchObject({
      cancelled: true,
      remoteAccepted: false,
    });
    expect(prisma.generationAttempt.updateMany).toHaveBeenCalled();

    prisma.generationOperation.findUnique.mockResolvedValueOnce({
      ...operation,
      status: 'succeeded',
    });
    await expect(service.cancel(operation.id)).resolves.toEqual({
      cancelled: false,
      remoteAccepted: false,
    });
  });

  it('rejects a late or non-current attempt result without domain mutation', async () => {
    prisma.generationOperation.findUnique.mockResolvedValue({
      ...operation,
      status: 'cancelled',
      currentAttemptId: '00000000-0000-4000-8000-000000000004',
    });
    const apply = jest.fn();
    handlers.get.mockReturnValue({ apply } as never);

    await expect(
      service.applySuccessfulResult(
        operation.id,
        '00000000-0000-4000-8000-000000000005',
        { output: { claims: [] } },
      ),
    ).resolves.toEqual({ applied: false, reason: 'stale' });

    expect(apply).not.toHaveBeenCalled();
    expect(prisma.generationOperation.update).not.toHaveBeenCalled();
  });

  it('atomically applies only the current attempt and closes both records', async () => {
    const attemptId = '00000000-0000-4000-8000-000000000004';
    prisma.generationOperation.findUnique.mockResolvedValue({
      ...operation,
      status: 'running',
      currentAttemptId: attemptId,
    });
    prisma.generationAttempt.findUnique.mockResolvedValue({
      id: attemptId,
      operationId: operation.id,
      status: 'submitted',
    });
    const apply = jest.fn().mockResolvedValue(undefined);
    handlers.get.mockReturnValue({ apply } as never);

    await expect(
      service.applySuccessfulResult(operation.id, attemptId, {
        output: { claims: [] },
      }),
    ).resolves.toEqual({ applied: true });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(1);
    const attemptUpdateCalls = prisma.generationAttempt.update.mock
      .calls as unknown[][];
    expect(attemptUpdateCalls[0]?.[0]).toMatchObject({
      where: { id: attemptId },
      data: { status: 'succeeded' },
    });
    const operationUpdateCalls = prisma.generationOperation.update.mock
      .calls as unknown[][];
    expect(operationUpdateCalls[0]?.[0]).toMatchObject({
      where: { id: operation.id },
      data: { status: 'succeeded' },
    });
  });

  it('rejects a current operation whose attempt record is missing', async () => {
    const attemptId = '00000000-0000-4000-8000-000000000004';
    prisma.generationOperation.findUnique.mockResolvedValue({
      ...operation,
      status: 'running',
      currentAttemptId: attemptId,
    });
    prisma.generationAttempt.findUnique.mockResolvedValue(null);

    await expect(
      service.applySuccessfulResult(operation.id, attemptId, { output: {} }),
    ).resolves.toEqual({ applied: false, reason: 'stale' });
    expect(handlers.get).not.toHaveBeenCalled();
  });
  // Restarting a document's processing raised the "processing did not
  // complete" banner right back, because the failure it counted was the one
  // just re-run. `superseded` was modelled as a terminal status and written by
  // nothing, so a dead operation stayed actionable forever.
  it('retires the operation a retry replaces', async () => {
    const previous = {
      ...operation,
      status: 'needs_attention',
      updatedAt: now,
      sourceDocumentId: null,
      baseSourceRevisionId: null,
      sourceRevisionId: null,
      categoryReferenceId: null,
      profileProposalId: null,
      profileRevisionId: null,
      clientReleaseId: null,
      clientCategoryContentId: null,
      promptVersion: 'v1',
      outputContractVersion: 'v1',
    };
    prisma.generationOperation.findUnique.mockResolvedValue(previous);
    prisma.generationOperation.upsert.mockResolvedValue({
      ...operation,
      id: '00000000-0000-4000-8000-000000000009',
    });

    await expect(service.retry(operation.id)).resolves.toMatchObject({
      id: '00000000-0000-4000-8000-000000000009',
    });

    expect(prisma.generationOperation.updateMany).toHaveBeenCalledWith({
      where: { id: operation.id, status: 'needs_attention' },
      data: expect.objectContaining({
        status: 'superseded',
        supersededAt: expect.any(Date),
      }),
    });
  });

  it('refuses to retry an operation that is still live', async () => {
    prisma.generationOperation.findUnique.mockResolvedValue({
      ...operation,
      status: 'running',
    });

    await expect(service.retry(operation.id)).resolves.toBeNull();
    expect(prisma.generationOperation.upsert).not.toHaveBeenCalled();
  });
  // Stopping locally is not stopping remotely. A batch we walk away from keeps
  // generating and keeps billing until it finishes on its own.
  it('tells the provider to drop a job it walks away from', async () => {
    prisma.generationOperation.findUnique.mockResolvedValue({
      ...operation,
      status: 'waiting_provider',
      currentAttempt: {
        id: 'attempt-1',
        provider: 'fake',
        providerJobId: 'batch-1',
      },
    });
    prisma.generationOperation.updateMany.mockResolvedValue({ count: 1 });

    await service.cancel(operation.id);

    expect(provider.cancelRemote).toHaveBeenCalledWith('batch-1');
  });

  it('drops the remote job when a deadline runs out too', async () => {
    prisma.generationAttempt.findUnique.mockResolvedValue({
      provider: 'fake',
      providerJobId: 'batch-2',
    });
    prisma.generationOperation.findUnique.mockResolvedValue(operation);
    prisma.generationOperation.updateMany.mockResolvedValue({ count: 0 });
    handlers.get.mockReturnValue({} as never);

    await service.abandonUnknown(operation.id, 'attempt-1', 'DEADLINE');

    expect(provider.cancelRemote).toHaveBeenCalledWith('batch-2');
  });
});
