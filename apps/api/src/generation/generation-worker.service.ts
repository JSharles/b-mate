import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import type { GenerationAttempt, GenerationOperation } from '@prisma/client';
import {
  GENERATION_PROVIDERS,
  GenerationPollResult,
  GenerationProviderAdapter,
  GenerationProviderFailure,
  GenerationProviderRequest,
  GenerationSubmission,
} from './adapters/generation-provider';
import { GenerationHandlerRegistry } from './generation-handler.registry';
import {
  GenerationPolicySnapshotSchema,
  GenerationPolicyRoute,
} from './policy/generation-policy.schema';
import { GenerationPolicyService } from './policy/generation-policy.service';
import {
  GenerationService,
  LeasedGenerationOperation,
} from './generation.service';

// How long to wait before reading a job we could not reach. Unrelated to the
// attempt budget: this delay costs nothing but a second look at the provider.
const POLL_RETRY_MS = 5_000;

@Injectable()
export class GenerationWorkerService {
  private readonly logger = new Logger(GenerationWorkerService.name);
  private readonly workerId = `generation-${randomUUID()}`;
  private readonly providersByKey: ReadonlyMap<
    string,
    GenerationProviderAdapter
  >;
  private ticking = false;

  constructor(
    private readonly generation: GenerationService,
    private readonly policy: GenerationPolicyService,
    private readonly handlers: GenerationHandlerRegistry,
    @Inject(GENERATION_PROVIDERS)
    providers: GenerationProviderAdapter[],
  ) {
    this.providersByKey = new Map(
      providers.map((provider) => [provider.key, provider]),
    );
  }

  @Interval(5_000)
  async tick(): Promise<void> {
    if (this.ticking) {
      return;
    }
    this.ticking = true;
    try {
      const operation = await this.generation.leaseNext(this.workerId);
      if (!operation) {
        return;
      }
      await this.process(operation);
    } finally {
      this.ticking = false;
    }
  }

  private async process(operation: LeasedGenerationOperation): Promise<void> {
    const parsedSnapshot = GenerationPolicySnapshotSchema.safeParse(
      operation.policySnapshot,
    );
    if (!parsedSnapshot.success) {
      await this.generation.recordAttemptFailure(operation, null, {
        errorClass: 'policy_denied',
        code: 'GENERATION_POLICY_SNAPSHOT_INVALID',
        retryable: false,
      });
      return;
    }
    const route = parsedSnapshot.data.routes[operation.currentRouteIndex];
    if (!route || !this.policy.isCurrentlyPermitted(operation.type, route)) {
      await this.generation.recordAttemptFailure(operation, null, {
        errorClass: 'policy_denied',
        code: 'GENERATION_POLICY_BLOCKED',
        retryable: false,
      });
      return;
    }
    const provider = this.providersByKey.get(route.provider);
    if (!provider) {
      await this.generation.recordAttemptFailure(operation, null, {
        errorClass: 'model_unavailable',
        code: 'GENERATION_PROVIDER_UNAVAILABLE',
        retryable: true,
      });
      return;
    }

    if (operation.currentAttemptId && operation.currentAttempt) {
      if (operation.currentAttempt.transport === 'sync') {
        await this.generation.recordAttemptFailure(
          operation,
          operation.currentAttempt.id,
          {
            errorClass: 'transient',
            code: 'GENERATION_SYNC_ATTEMPT_INTERRUPTED',
            retryable: true,
          },
        );
        return;
      }
      await this.poll(operation, operation.currentAttempt, provider);
      return;
    }
    await this.submit(operation, route, provider);
  }

  private async submit(
    operation: LeasedGenerationOperation,
    route: GenerationPolicyRoute,
    provider: GenerationProviderAdapter,
  ): Promise<void> {
    let attempt: GenerationAttempt | null = null;
    try {
      attempt = await this.generation.startAttempt(operation, route);
      const input = await this.handlers
        .get(operation.type)
        .buildRequest(operation);
      const request: GenerationProviderRequest = {
        ...input,
        operationId: operation.id,
        attemptId: attempt.id,
        model: route.model,
        transport: route.transport,
        correlationId: `${operation.id}:${attempt.id}`,
      };
      const submission = await provider.submit(request);
      await this.handleSubmission(operation, attempt.id, submission);
    } catch (error) {
      await this.generation.recordAttemptFailure(
        operation,
        attempt?.id ?? null,
        this.normalizeThrown(error),
      );
    }
  }

  private async handleSubmission(
    operation: GenerationOperation,
    attemptId: string,
    submission: GenerationSubmission,
  ): Promise<void> {
    if (submission.state === 'completed') {
      await this.generation.applySuccessfulResult(
        operation.id,
        attemptId,
        submission.result,
      );
      return;
    }
    if (submission.state === 'accepted') {
      await this.generation.markSubmitted(operation.id, attemptId, submission);
      return;
    }
    await this.generation.recordAttemptFailure(
      operation,
      attemptId,
      submission.failure,
    );
  }

  private async poll(
    operation: LeasedGenerationOperation,
    attempt: GenerationAttempt,
    provider: GenerationProviderAdapter,
  ): Promise<void> {
    if (!attempt.providerJobId) {
      await this.generation.recordAttemptFailure(operation, attempt.id, {
        errorClass: 'invalid_request',
        code: 'GENERATION_PROVIDER_JOB_MISSING',
        retryable: false,
      });
      return;
    }
    const snapshot = GenerationPolicySnapshotSchema.parse(
      operation.policySnapshot,
    );
    const route =
      snapshot.routes[attempt.routeIndex ?? operation.currentRouteIndex];
    const startedAt = attempt.submittedAt ?? attempt.createdAt ?? new Date();
    if (!route || Date.now() - startedAt.getTime() >= route.remoteDeadlineMs) {
      await this.generation.abandonUnknown(
        operation.id,
        attempt.id,
        'GENERATION_REMOTE_DEADLINE_EXCEEDED',
      );
      return;
    }
    // Only reading the job is covered here. Everything after it is our own
    // work on a result we already hold, and a bug in that work is not a reason
    // to read the job again — see below.
    let result: GenerationPollResult;
    try {
      result = await provider.poll({
        operationId: operation.id,
        attemptId: attempt.id,
        model: attempt.model,
        providerJobId: attempt.providerJobId,
        providerCorrelationId: attempt.providerCorrelationId,
        providerRequestId: attempt.providerRequestId,
      });
    } catch (error) {
      await this.generation.markPolling(
        operation.id,
        attempt.id,
        new Date(Date.now() + POLL_RETRY_MS),
      );
      this.logger.warn(
        `Could not read ${attempt.providerJobId}: ${describe(error)}`,
      );
      return;
    }

    // Reading the job failed, so the job itself is untouched: poll it again
    // rather than spending one of the attempt budget on a network blip.
    if (result.state === 'unreadable') {
      await this.generation.markPolling(
        operation.id,
        attempt.id,
        new Date(Date.now() + POLL_RETRY_MS),
      );
      return;
    }

    try {
      // Anything else is the job's own outcome. A retryable one goes back
      // through recordAttemptFailure, which submits a *new* job and stops at
      // the route's maxAttempts. Re-polling the finished job instead — which
      // is what this did — returns the same bad result every five seconds
      // until the remote deadline, a full day of silent retries.
      await this.handlePoll(operation, attempt.id, result);
    } catch (error) {
      // Applying a result we successfully fetched is our own code. When it
      // threw, the catch that also covered the fetch re-read the finished job
      // instead — for eight hours, in silence, on a batch that had succeeded
      // in five minutes. A domain failure is the attempt's failure, and it
      // says why.
      this.logger.error(
        `Applying ${operation.type} ${operation.id} failed: ${describe(error)}`,
      );
      await this.generation.recordAttemptFailure(operation, attempt.id, {
        errorClass: 'invalid_output',
        code: 'GENERATION_RESULT_NOT_APPLICABLE',
        retryable: true,
        protectedDiagnostic: describe(error),
      });
    }
  }

  private async handlePoll(
    operation: GenerationOperation,
    attemptId: string,
    result: GenerationPollResult,
  ): Promise<void> {
    if (result.state === 'pending') {
      await this.generation.markPolling(
        operation.id,
        attemptId,
        result.nextPollAt,
      );
      return;
    }
    if (result.state === 'completed') {
      await this.generation.applySuccessfulResult(
        operation.id,
        attemptId,
        result.result,
      );
      return;
    }
    await this.generation.recordAttemptFailure(
      operation,
      attemptId,
      result.failure,
    );
  }

  private normalizeThrown(error: unknown): GenerationProviderFailure {
    return {
      errorClass: 'unknown',
      code: 'GENERATION_PROVIDER_ERROR',
      retryable: true,
      protectedDiagnostic: (error instanceof Error
        ? error.message
        : String(error)
      ).slice(0, 2000),
    };
  }
}

// The message is what makes a silent loop diagnosable. Bounded because it is
// persisted on the attempt, where a provider payload must never end up whole.
function describe(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(
    0,
    2000,
  );
}
