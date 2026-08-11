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
  | { state: 'failed'; failure: GenerationProviderFailure };

export interface GenerationProviderAdapter {
  readonly key: string;
  submit(request: GenerationProviderRequest): Promise<GenerationSubmission>;
  poll(request: GenerationPollRequest): Promise<GenerationPollResult>;
}

export const GENERATION_PROVIDERS = Symbol('GENERATION_PROVIDERS');
