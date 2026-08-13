import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import type {
  ContentBlockParam,
  Message,
  MessageCreateParamsNonStreaming,
} from '@anthropic-ai/sdk/resources/messages/messages';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GenerationPollRequest,
  GenerationPollResult,
  GenerationProviderAdapter,
  GenerationProviderFailure,
  GenerationProviderRequest,
  GenerationProviderResult,
  GenerationSubmission,
  GenerationUsage,
} from './generation-provider';
import { classifyHttpFailure } from '../generation-errors';

const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;
const POLL_INTERVAL_MS = 5_000;

// `output_config.effort` is rejected outright by models that do not take it:
// Haiku 4.5 answers 400 "This model does not support the effort parameter".
// The models endpoint reports it per model under `capabilities.effort` — this
// list is the offline copy, and the 400 is unmistakable if it ever drifts.
const MODELS_ACCEPTING_EFFORT = /^claude-(opus|sonnet|fable|mythos)-/u;

@Injectable()
export class AnthropicGenerationProvider implements GenerationProviderAdapter {
  readonly key = 'anthropic';
  private readonly client: Anthropic | null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    this.client = apiKey ? new Anthropic({ apiKey, maxRetries: 0 }) : null;
  }

  async submit(
    request: GenerationProviderRequest,
  ): Promise<GenerationSubmission> {
    if (!this.client) {
      return failed('model_unavailable', 'ANTHROPIC_CREDENTIAL_MISSING', false);
    }
    if (!request.outputSchema) {
      return failed(
        'invalid_request',
        'ANTHROPIC_OUTPUT_SCHEMA_MISSING',
        false,
      );
    }

    try {
      const params = this.buildParams(request, request.outputSchema);
      const options = request.timeoutMs
        ? { timeout: request.timeoutMs }
        : undefined;
      if (request.transport === 'batch') {
        const batch = await this.client.messages.batches.create(
          { requests: [{ custom_id: request.attemptId, params }] },
          options,
        );
        return {
          state: 'accepted',
          providerCorrelationId: request.correlationId,
          providerJobId: batch.id,
          nextPollAt: nextPollAt(),
        };
      }

      // Streamed, not because anyone reads the chunks, but because the SDK
      // refuses a non-streaming call whose budget could take over ten minutes
      // — and these stages ask for 64k. `finalMessage()` gives back exactly
      // what `create` would have.
      const message = await this.client.messages
        .stream(params, options)
        .finalMessage();
      return this.completed(message, request.correlationId);
    } catch (error) {
      return { state: 'failed', failure: normalizeAnthropicError(error) };
    }
  }

  async poll(request: GenerationPollRequest): Promise<GenerationPollResult> {
    if (!this.client) {
      return failedPoll(
        'model_unavailable',
        'ANTHROPIC_CREDENTIAL_MISSING',
        false,
      );
    }

    try {
      const batch = await this.client.messages.batches.retrieve(
        request.providerJobId,
      );
      if (batch.processing_status !== 'ended') {
        return { state: 'pending', nextPollAt: nextPollAt() };
      }
      // Past this point the batch has ended: every outcome below is final for
      // this attempt. Only the enclosing catch, which means we never got to
      // read the batch, is worth polling again.

      const results = await this.client.messages.batches.results(
        request.providerJobId,
      );
      for await (const item of results) {
        if (item.custom_id !== request.attemptId) {
          continue;
        }
        if (item.result.type === 'succeeded') {
          return this.completed(
            item.result.message,
            request.providerCorrelationId ?? request.attemptId,
          );
        }
        const code = `ANTHROPIC_BATCH_${item.result.type.toUpperCase()}`;
        return failedPoll(
          item.result.type === 'errored' ? 'provider_terminal' : 'transient',
          code,
          item.result.type === 'errored',
        );
      }
      return failedPoll(
        'provider_terminal',
        'ANTHROPIC_BATCH_RESULT_MISSING',
        false,
      );
    } catch (error) {
      return { state: 'unreadable', failure: normalizeAnthropicError(error) };
    }
  }

  async cancelRemote(providerJobId: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.messages.batches.cancel(providerJobId);
    } catch {
      // A batch that already ended cannot be cancelled, and a provider we
      // cannot reach must not hold up stopping on our side.
    }
  }

  private buildParams(
    request: GenerationProviderRequest,
    outputSchema: Record<string, unknown>,
  ): MessageCreateParamsNonStreaming {
    const schema = addMissingScalarTypes(outputSchema);
    if (schema.type !== 'object') {
      throw new Error('Anthropic output schema root must be an object.');
    }
    const anthropicSchema = jsonSchemaOutputFormat(
      schema as Parameters<typeof jsonSchemaOutputFormat>[0],
    ).schema;
    return {
      model: request.model,
      max_tokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      metadata: { user_id: request.correlationId },
      messages: [
        { role: 'user', content: request.parts.map(toAnthropicContent) },
      ],
      output_config: {
        format: { type: 'json_schema', schema: anthropicSchema },
        ...(request.effort && MODELS_ACCEPTING_EFFORT.test(request.model)
          ? { effort: request.effort }
          : {}),
      },
    };
  }

  private completed(
    message: Message,
    correlationId: string,
  ): GenerationSubmission & GenerationPollResult {
    // A truncated answer is not malformed JSON, it is a budget that was too
    // small — and it says so. Naming it separately matters: reported as
    // "invalid output" it sent us looking at the schema and the prompt, when
    // the model had simply spent every output token reasoning and emitted no
    // text at all.
    if (message.stop_reason === 'max_tokens') {
      return failed('invalid_output', 'ANTHROPIC_OUTPUT_TRUNCATED', true);
    }
    const text = message.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');
    try {
      const output = JSON.parse(text) as unknown;
      const result: GenerationProviderResult = {
        output,
        usage: normalizeUsage(message.usage),
        providerCorrelationId: correlationId,
        providerRequestId:
          (message as Message & { _request_id?: string })._request_id ??
          message.id,
      };
      return { state: 'completed', result };
    } catch {
      return failed('invalid_output', 'ANTHROPIC_INVALID_OUTPUT', true);
    }
  }
}

function addMissingScalarTypes(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const transformed = Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      transformSchemaValue(child),
    ]),
  );
  if (transformed.type === undefined) {
    const inferred = inferJsonSchemaType(transformed.const ?? transformed.enum);
    if (inferred) transformed.type = inferred;
  }
  return transformed;
}

function transformSchemaValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(transformSchemaValue);
  if (value && typeof value === 'object') {
    return addMissingScalarTypes(value as Record<string, unknown>);
  }
  return value;
}

function inferJsonSchemaType(value: unknown): string | null {
  const candidates = Array.isArray(value) ? value : [value];
  if (
    candidates.length === 0 ||
    candidates.some((item) => item === undefined)
  ) {
    return null;
  }
  const types = new Set(
    candidates.map((item) =>
      typeof item === 'number' && Number.isInteger(item)
        ? 'integer'
        : typeof item,
    ),
  );
  const [type] = [...types];
  return types.size === 1 &&
    ['string', 'integer', 'number', 'boolean'].includes(type)
    ? type
    : null;
}

function toAnthropicContent(
  part: GenerationProviderRequest['parts'][number],
): ContentBlockParam {
  switch (part.kind) {
    case 'text':
      return { type: 'text', text: part.text };
    case 'json':
      return { type: 'text', text: JSON.stringify(part.value) };
    case 'pdf':
      return {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: Buffer.from(part.data).toString('base64'),
        },
      };
    case 'image':
      if (part.mimeType !== 'image/png' && part.mimeType !== 'image/jpeg') {
        throw Object.assign(
          new Error(`Unsupported Anthropic image type: ${part.mimeType}`),
          { status: 400 },
        );
      }
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: part.mimeType,
          data: Buffer.from(part.data).toString('base64'),
        },
      };
  }
}

function normalizeUsage(usage: Message['usage']): GenerationUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

function normalizeAnthropicError(error: unknown): GenerationProviderFailure {
  return classifyHttpFailure('anthropic', error);
}

function failure(
  errorClass: GenerationProviderFailure['errorClass'],
  code: string,
  retryable: boolean,
  error?: unknown,
): GenerationProviderFailure {
  const status = (error as { status?: number } | undefined)?.status;
  return {
    errorClass,
    code,
    retryable,
    ...(status === undefined ? {} : { httpStatus: status }),
    ...(error === undefined
      ? {}
      : {
          protectedDiagnostic: (error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : (JSON.stringify(error) ?? 'Unknown provider error')
          ).slice(0, 2_000),
        }),
  };
}

function failed(
  errorClass: GenerationProviderFailure['errorClass'],
  code: string,
  retryable: boolean,
): Extract<GenerationSubmission, { state: 'failed' }> {
  return { state: 'failed', failure: failure(errorClass, code, retryable) };
}

function failedPoll(
  errorClass: GenerationProviderFailure['errorClass'],
  code: string,
  retryable: boolean,
): Extract<GenerationPollResult, { state: 'failed' }> {
  return { state: 'failed', failure: failure(errorClass, code, retryable) };
}

function nextPollAt(): Date {
  return new Date(Date.now() + POLL_INTERVAL_MS);
}
