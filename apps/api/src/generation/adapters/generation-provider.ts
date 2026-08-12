import type { GenerationErrorClass, GenerationTransport } from '@prisma/client';

export type GenerationRequestPart =
  | { kind: 'text'; text: string }
  | { kind: 'json'; value: unknown }
  | { kind: 'pdf'; data: Uint8Array; mimeType: 'application/pdf' }
  | { kind: 'image'; data: Uint8Array; mimeType: string };

export interface GenerationProviderRequest {
  operationId: string;
  attemptId: string;
  model: string;
  transport: GenerationTransport;
  parts: GenerationRequestPart[];
  outputContract: string;
  outputSchema?: Record<string, unknown>;
  maxOutputTokens?: number;
  // How much reasoning a stage is worth. Left unset the model decides, and on a
  // mechanical stage it decides generously: extraction spent 21k of its 32k
  // output budget thinking about a Notion page and got cut off mid-answer.
  effort?: 'low' | 'medium' | 'high';
  // The route's requestTimeoutMs. It was validated by the policy schema and
  // then read by nobody, so a stage could declare a 30s budget and wait ten
  // minutes on the SDK default.
  timeoutMs?: number;
  correlationId: string;
}

export interface GenerationUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  raw?: unknown;
}

export interface GenerationProviderResult {
  output: unknown;
  usage?: GenerationUsage;
  providerCorrelationId?: string;
  providerRequestId?: string;
}

export interface GenerationProviderFailure {
  errorClass: GenerationErrorClass;
  code: string;
  retryable: boolean;
  httpStatus?: number;
  protectedDiagnostic?: string;
}

export type GenerationSubmission =
  | { state: 'completed'; result: GenerationProviderResult }
  | {
      state: 'accepted';
      providerCorrelationId?: string;
      providerRequestId?: string;
      providerJobId: string;
      nextPollAt: Date;
    }
  | { state: 'failed'; failure: GenerationProviderFailure };

export interface GenerationPollRequest {
  operationId: string;
  attemptId: string;
  model: string;
  providerJobId: string;
  providerCorrelationId?: string | null;
  providerRequestId?: string | null;
}

export type GenerationPollResult =
  | { state: 'pending'; nextPollAt: Date }
  | { state: 'completed'; result: GenerationProviderResult }
  // The job could not be read at all — a network error, a 429, a 500. The
  // remote job is untouched, so the right move is to read it again later.
  | { state: 'unreadable'; failure: GenerationProviderFailure }
  // The job ended and its outcome is unusable. Reading it again is pointless:
  // a finished job returns the same thing forever. Separating this from
  // `unreadable` is what stops a bad result from being polled in a loop.
  | { state: 'failed'; failure: GenerationProviderFailure };

export interface GenerationProviderAdapter {
  readonly key: string;
  submit(request: GenerationProviderRequest): Promise<GenerationSubmission>;
  poll(request: GenerationPollRequest): Promise<GenerationPollResult>;
  /**
   * Tells the provider we no longer want a job we already submitted. Without
   * it, stopping a document or giving up on a deadline only stopped us
   * waiting: the model kept generating, and we kept paying for output nobody
   * would ever read. Best effort — a job that has already ended cannot be
   * called back, and failing to reach the provider must not block the local
   * decision to stop.
   */
  cancelRemote(providerJobId: string): Promise<void>;
}

export const GENERATION_PROVIDERS = Symbol('GENERATION_PROVIDERS');
