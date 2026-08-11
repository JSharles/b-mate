import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  GenerationPollRequest,
  GenerationPollResult,
  GenerationProviderAdapter,
  GenerationProviderRequest,
  GenerationProviderResult,
  GenerationSubmission,
} from './generation-provider';

@Injectable()
export class FakeGenerationProvider implements GenerationProviderAdapter {
  readonly key = 'fake';

  private readonly overrides = new Map<string, GenerationProviderResult>();
  private readonly accepted = new Map<string, GenerationProviderResult>();

  setResult(operationId: string, result: GenerationProviderResult): void {
    this.overrides.set(operationId, result);
  }

  submit(request: GenerationProviderRequest): Promise<GenerationSubmission> {
    const result =
      this.overrides.get(request.operationId) ??
      this.deterministicResult(request);
    if (request.transport === 'batch') {
      const providerJobId = `fake-job-${request.attemptId}`;
      this.accepted.set(providerJobId, result);
      return Promise.resolve({
        state: 'accepted',
        providerCorrelationId: request.correlationId,
        providerJobId,
        nextPollAt: new Date(Date.now() + 5_000),
      });
    }
    return Promise.resolve({ state: 'completed', result });
  }

  poll(request: GenerationPollRequest): Promise<GenerationPollResult> {
    const result = this.accepted.get(request.providerJobId);
    if (!result) {
      return Promise.resolve({
        state: 'failed',
        failure: {
          errorClass: 'provider_terminal',
          code: 'FAKE_JOB_NOT_FOUND',
          retryable: false,
        },
      });
    }
    this.accepted.delete(request.providerJobId);
    return Promise.resolve({ state: 'completed', result });
  }

  private deterministicResult(
    request: GenerationProviderRequest,
  ): GenerationProviderResult {
    const serialized = JSON.stringify(
      request.parts.map((part) =>
        part.kind === 'text'
          ? { kind: part.kind, text: part.text }
          : part.kind === 'json'
            ? part
            : { kind: part.kind, byteLength: part.data.byteLength },
      ),
    );
    const fingerprint = createHash('sha256').update(serialized).digest('hex');
    return {
      output: {
        fixture: 'deterministic-fake',
        outputContract: request.outputContract,
        fingerprint,
      },
      usage: {
        inputTokens: Math.ceil(serialized.length / 4),
        outputTokens: 16,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      providerCorrelationId: request.correlationId,
    };
  }
}
