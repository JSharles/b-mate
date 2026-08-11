import { Injectable } from '@nestjs/common';
import type {
  GenerationAttempt,
  GenerationOperation,
  GenerationOperationStatus,
  GenerationOperationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type {
  GenerationProviderFailure,
  GenerationProviderResult,
  GenerationSubmission,
} from './adapters/generation-provider';
import { GenerationHandlerRegistry } from './generation-handler.registry';
import type { GenerationPolicyRoute } from './policy/generation-policy.schema';
import { GenerationPolicyService } from './policy/generation-policy.service';

const ACTIVE_OPERATION_STATUSES: readonly GenerationOperationStatus[] = [
  'queued',
  'running',
  'waiting_provider',
  'retry_scheduled',
] as const;
const TERMINAL_OPERATION_STATUSES: readonly GenerationOperationStatus[] = [
  'succeeded',
  'needs_attention',
  'cancelled',
  'superseded',
] as const;
const LEASE_MS = 30_000;
const RETRY_DELAY_MS = 5_000;

export interface CreateGenerationOperationInput {
  projectId: string;
  type: GenerationOperationType;
  deduplicationKey: string;
  inputFingerprint: string;
  promptVersion: string;
  outputContractVersion: string;
  sourceDocumentId?: string;
  baseSourceRevisionId?: string;
  sourceRevisionId?: string;
  categoryReferenceId?: string;
  profileProposalId?: string;
  profileRevisionId?: string;
  clientReleaseId?: string;
  clientCategoryContentId?: string;
  replacesOperationId?: string;
}

export type LeasedGenerationOperation = GenerationOperation & {
  currentAttempt: GenerationAttempt | null;
};

@Injectable()
export class GenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: GenerationPolicyService,
    private readonly handlers: GenerationHandlerRegistry,
  ) {}

  create(input: CreateGenerationOperationInput): Promise<GenerationOperation> {
    return this.createInTransaction(this.prisma, input);
  }

  createInTransaction(
    client: Pick<Prisma.TransactionClient, 'generationOperation'>,
    input: CreateGenerationOperationInput,
  ): Promise<GenerationOperation> {
    const policySnapshot = this.policy.snapshotFor(input.type);
    return client.generationOperation.upsert({
      where: { deduplicationKey: input.deduplicationKey },
      update: {},
      create: {
        ...input,
        policySnapshot: policySnapshot as unknown as Prisma.InputJsonValue,
        status: 'queued',
      },
    });
  }

  async leaseNext(
    workerId: string,
    now = new Date(),
  ): Promise<LeasedGenerationOperation | null> {
    const candidate = await this.prisma.generationOperation.findFirst({
      where: {
        status: { in: [...ACTIVE_OPERATION_STATUSES] },
        runAfter: { lte: now },
        OR: [
          { leaseExpiresAt: null },
          { leaseExpiresAt: { lte: now } },
          { leaseOwner: workerId },
        ],
      },
      orderBy: [{ runAfter: 'asc' }, { createdAt: 'asc' }],
    });
    if (!candidate) {
      return null;
    }

    const leaseExpiresAt = new Date(now.getTime() + LEASE_MS);
    const claimed = await this.prisma.generationOperation.updateMany({
      where: {
        id: candidate.id,
        status: { in: [...ACTIVE_OPERATION_STATUSES] },
        runAfter: { lte: now },
        OR: [
          { leaseExpiresAt: null },
          { leaseExpiresAt: { lte: now } },
          { leaseOwner: workerId },
        ],
      },
      data: { status: 'running', leaseOwner: workerId, leaseExpiresAt },
    });
    if (claimed.count !== 1) {
      return null;
    }

    return this.prisma.generationOperation.findUnique({
      where: { id: candidate.id },
      include: { currentAttempt: true },
    });
  }

  async startAttempt(
    operation: GenerationOperation,
    route: GenerationPolicyRoute,
  ): Promise<GenerationAttempt> {
    return this.prisma.$transaction(async (tx) => {
      const attemptCount = await tx.generationAttempt.count({
        where: { operationId: operation.id },
      });
      const attempt = await tx.generationAttempt.create({
        data: {
          operationId: operation.id,
          ordinal: attemptCount + 1,
          routeIndex: operation.currentRouteIndex,
          provider: route.provider,
          model: route.model,
          transport: route.transport,
          status: 'submitting',
        },
      });
      const claimed = await tx.generationOperation.updateMany({
        where: {
          id: operation.id,
          status: 'running',
          currentAttemptId: null,
        },
        data: { currentAttemptId: attempt.id },
      });
      if (claimed.count !== 1) {
        throw new Error('Generation operation is no longer available.');
      }
      return attempt;
    });
  }

  async markSubmitted(
    operationId: string,
    attemptId: string,
    submission: Extract<GenerationSubmission, { state: 'accepted' }>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.generationAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'submitted',
          providerCorrelationId: submission.providerCorrelationId,
          providerRequestId: submission.providerRequestId,
          providerJobId: submission.providerJobId,
          nextPollAt: submission.nextPollAt,
          submittedAt: new Date(),
        },
      });
      const updated = await tx.generationOperation.updateMany({
        where: {
          id: operationId,
          currentAttemptId: attemptId,
          status: 'running',
        },
        data: {
          status: 'waiting_provider',
          runAfter: submission.nextPollAt,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      if (updated.count !== 1) {
        throw new Error('Generation attempt is no longer current.');
      }
    });
  }

  async markPolling(
    operationId: string,
    attemptId: string,
    nextPollAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.generationAttempt.updateMany({
        where: { id: attemptId, operationId },
        data: { status: 'polling', nextPollAt },
      });
      await tx.generationOperation.updateMany({
        where: {
          id: operationId,
          currentAttemptId: attemptId,
          status: 'running',
        },
        data: {
          status: 'waiting_provider',
          runAfter: nextPollAt,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
    });
  }

  async recordAttemptFailure(
    operation: GenerationOperation,
    attemptId: string | null,
    failure: GenerationProviderFailure,
  ): Promise<void> {
    const snapshot = operation.policySnapshot as unknown as {
      routes: GenerationPolicyRoute[];
    };
    const route = snapshot.routes[operation.currentRouteIndex];
    const attemptsOnRoute = attemptId
      ? await this.prisma.generationAttempt.count({
          where: {
            operationId: operation.id,
            routeIndex: operation.currentRouteIndex,
          },
        })
      : (route?.maxAttempts ?? 1);
    const retryCurrent =
      failure.retryable && route && attemptsOnRoute < route.maxAttempts;
    const nextRouteIndex = retryCurrent
      ? operation.currentRouteIndex
      : operation.currentRouteIndex + 1;
    const hasNextRoute = nextRouteIndex < snapshot.routes.length;
    const status =
      retryCurrent || hasNextRoute ? 'retry_scheduled' : 'needs_attention';

    await this.prisma.$transaction(async (tx) => {
      if (attemptId) {
        await tx.generationAttempt.updateMany({
          where: { id: attemptId, operationId: operation.id },
          data: {
            status: 'failed',
            errorClass: failure.errorClass,
            errorCode: failure.code,
            errorHttpStatus: failure.httpStatus,
            retryable: failure.retryable,
            protectedDiagnostic: failure.protectedDiagnostic?.slice(0, 2000),
            terminalAt: new Date(),
          },
        });
      }
      const updated = await tx.generationOperation.updateMany({
        where: {
          id: operation.id,
          status: { in: [...ACTIVE_OPERATION_STATUSES] },
          ...(attemptId ? { currentAttemptId: attemptId } : {}),
        },
        data: {
          status,
          currentAttemptId: null,
          currentRouteIndex: nextRouteIndex,
          runAfter: new Date(Date.now() + RETRY_DELAY_MS),
          leaseOwner: null,
          leaseExpiresAt: null,
          terminalFailureCode:
            status === 'needs_attention' ? failure.code : null,
        },
      });
      const handler = this.handlers.get(operation.type);
      if (
        updated.count === 1 &&
        status === 'needs_attention' &&
        handler.onTerminalFailure
      ) {
        await handler.onTerminalFailure(tx, operation, failure.code);
      }
    });
  }

  async cancel(operationId: string): Promise<{
    cancelled: boolean;
    remoteAccepted: boolean;
  }> {
    const operation = await this.prisma.generationOperation.findUnique({
      where: { id: operationId },
      include: { currentAttempt: true },
    });
    if (!operation || TERMINAL_OPERATION_STATUSES.includes(operation.status)) {
      return { cancelled: false, remoteAccepted: false };
    }
    const remoteAccepted = Boolean(operation.currentAttempt?.providerJobId);

    const updated = await this.prisma.generationOperation.updateMany({
      where: {
        id: operationId,
        status: { in: [...ACTIVE_OPERATION_STATUSES] },
      },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        terminalFailureCode: 'CANCELLED_BY_OPERATOR',
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    if (updated.count === 1 && operation.currentAttempt && !remoteAccepted) {
      await this.prisma.generationAttempt.updateMany({
        where: {
          id: operation.currentAttempt.id,
          status: 'submitting',
        },
        data: { status: 'cancelled', terminalAt: new Date() },
      });
    }
    return { cancelled: updated.count === 1, remoteAccepted };
  }

  async applySuccessfulResult(
    operationId: string,
    attemptId: string,
    result: GenerationProviderResult,
  ): Promise<{ applied: boolean; reason?: 'stale' }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "generation_operations"
        WHERE "id" = ${operationId}::uuid
        FOR UPDATE
      `;
      const operation = await tx.generationOperation.findUnique({
        where: { id: operationId },
      });
      if (
        !operation ||
        operation.currentAttemptId !== attemptId ||
        !ACTIVE_OPERATION_STATUSES.includes(operation.status)
      ) {
        return { applied: false, reason: 'stale' as const };
      }
      const attempt = await tx.generationAttempt.findUnique({
        where: { id: attemptId },
      });
      if (!attempt || attempt.operationId !== operationId) {
        return { applied: false, reason: 'stale' as const };
      }

      await this.handlers.get(operation.type).apply(tx, operation, result);
      await tx.generationAttempt.update({
        where: { id: attemptId },
        data: {
          status: 'succeeded',
          inputTokens: result.usage?.inputTokens,
          outputTokens: result.usage?.outputTokens,
          cacheReadTokens: result.usage?.cacheReadTokens,
          cacheWriteTokens: result.usage?.cacheWriteTokens,
          rawUsage: result.usage?.raw as Prisma.InputJsonValue | undefined,
          terminalAt: new Date(),
        },
      });
      await tx.generationOperation.update({
        where: { id: operationId },
        data: {
          status: 'succeeded',
          completedAt: new Date(),
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      return { applied: true };
    });
  }

  async abandonUnknown(
    operationId: string,
    attemptId: string,
    code: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const operation = await tx.generationOperation.findUnique({
        where: { id: operationId },
      });
      if (!operation) return;
      await tx.generationAttempt.updateMany({
        where: { id: attemptId, operationId },
        data: {
          status: 'abandoned_unknown',
          errorClass: 'transient',
          errorCode: code,
          retryable: false,
          terminalAt: new Date(),
        },
      });
      const updated = await tx.generationOperation.updateMany({
        where: {
          id: operationId,
          currentAttemptId: attemptId,
          status: { in: [...ACTIVE_OPERATION_STATUSES] },
        },
        data: {
          status: 'needs_attention',
          terminalFailureCode: code,
          leaseOwner: null,
          leaseExpiresAt: null,
        },
      });
      const handler = this.handlers.get(operation.type);
      if (updated.count === 1 && handler.onTerminalFailure) {
        await handler.onTerminalFailure(tx, operation, code);
      }
    });
  }

  async retry(operationId: string): Promise<GenerationOperation | null> {
    const previous = await this.prisma.generationOperation.findUnique({
      where: { id: operationId },
    });
    if (!previous || previous.status !== 'needs_attention') return null;
    return this.create({
      projectId: previous.projectId,
      type: previous.type,
      deduplicationKey: `${previous.deduplicationKey}:retry:${previous.id}:${previous.updatedAt.getTime()}`,
      inputFingerprint: previous.inputFingerprint,
      promptVersion: previous.promptVersion,
      outputContractVersion: previous.outputContractVersion,
      sourceDocumentId: previous.sourceDocumentId ?? undefined,
      baseSourceRevisionId: previous.baseSourceRevisionId ?? undefined,
      sourceRevisionId: previous.sourceRevisionId ?? undefined,
      categoryReferenceId: previous.categoryReferenceId ?? undefined,
      profileProposalId: previous.profileProposalId ?? undefined,
      profileRevisionId: previous.profileRevisionId ?? undefined,
      clientReleaseId: previous.clientReleaseId ?? undefined,
      clientCategoryContentId: previous.clientCategoryContentId ?? undefined,
      replacesOperationId: previous.id,
    });
  }
}
