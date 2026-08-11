import OpenAI from 'openai';
import type {
  Response,
  ResponseInputContent,
} from 'openai/resources/responses/responses';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { classifyHttpFailure } from '../generation-errors';
import type {
  GenerationPollRequest,
  GenerationPollResult,
  GenerationProviderAdapter,
  GenerationProviderRequest,
  GenerationProviderResult,
  GenerationSubmission,
} from './generation-provider';

const POLL_MS = 5_000;
@Injectable()
export class OpenAIGenerationProvider implements GenerationProviderAdapter {
  readonly key = 'openai';
  private readonly client: OpenAI | null;
  constructor(config: ConfigService) {
    const apiKey = config.get<string>('OPENAI_API_KEY');
    this.client = apiKey ? new OpenAI({ apiKey, maxRetries: 0 }) : null;
  }
  async submit(
    request: GenerationProviderRequest,
  ): Promise<GenerationSubmission> {
    if (!this.client) return failed('OPENAI_CREDENTIAL_MISSING');
    if (!request.outputSchema)
      return {
        state: 'failed',
        failure: {
          errorClass: 'invalid_request',
          code: 'OPENAI_OUTPUT_SCHEMA_MISSING',
          retryable: false,
        },
      };
    try {
      const response = await this.client.responses.create({
        model: request.model,
        input: [{ role: 'user', content: request.parts.map(toContent) }],
        text: {
          format: {
            type: 'json_schema',
            name: 'generation_output',
            strict: true,
            schema: request.outputSchema,
          },
        },
        max_output_tokens: request.maxOutputTokens,
        metadata: { correlation_id: request.correlationId },
        store: false,
        background: request.transport === 'batch',
      });
      if (response.status === 'completed')
        return completed(response, request.correlationId);
      if (
        response.status === 'failed' ||
        response.status === 'cancelled' ||
        response.status === 'incomplete'
      )
        return {
          state: 'failed',
          failure: {
            errorClass: 'provider_terminal',
            code: `OPENAI_${response.status.toUpperCase()}`,
            retryable: response.status === 'incomplete',
          },
        };
      return {
        state: 'accepted',
        providerCorrelationId: request.correlationId,
        providerRequestId: response.id,
        providerJobId: response.id,
        nextPollAt: nextPollAt(),
      };
    } catch (error) {
      return { state: 'failed', failure: classifyHttpFailure('openai', error) };
    }
  }
  async poll(request: GenerationPollRequest): Promise<GenerationPollResult> {
    if (!this.client) return failedPoll('OPENAI_CREDENTIAL_MISSING');
    try {
      const response = await this.client.responses.retrieve(
        request.providerJobId,
      );
      if (response.status === 'completed')
        return completed(
          response,
          request.providerCorrelationId ?? request.attemptId,
        );
      if (
        response.status === 'failed' ||
        response.status === 'cancelled' ||
        response.status === 'incomplete'
      )
        return {
          state: 'failed',
          failure: {
            errorClass: 'provider_terminal',
            code: `OPENAI_${response.status.toUpperCase()}`,
            retryable: response.status === 'incomplete',
          },
        };
      return { state: 'pending', nextPollAt: nextPollAt() };
    } catch (error) {
      return { state: 'failed', failure: classifyHttpFailure('openai', error) };
    }
  }
}
function toContent(
  part: GenerationProviderRequest['parts'][number],
): ResponseInputContent {
  if (part.kind === 'text') return { type: 'input_text', text: part.text };
  if (part.kind === 'json')
    return { type: 'input_text', text: JSON.stringify(part.value) };
  if (part.kind === 'pdf')
    return {
      type: 'input_file',
      filename: 'document.pdf',
      file_data: `data:application/pdf;base64,${Buffer.from(part.data).toString('base64')}`,
    };
  return {
    type: 'input_image',
    detail: 'auto',
    image_url: `data:${part.mimeType};base64,${Buffer.from(part.data).toString('base64')}`,
  };
}
function completed(
  response: Response,
  correlationId: string,
): GenerationSubmission & GenerationPollResult {
  try {
    const output = JSON.parse(response.output_text) as unknown;
    const usage = response.usage;
    const result: GenerationProviderResult = {
      output,
      providerCorrelationId: correlationId,
      providerRequestId: response.id,
      ...(usage
        ? {
            usage: {
              inputTokens: usage.input_tokens,
              outputTokens: usage.output_tokens,
              cacheReadTokens: usage.input_tokens_details.cached_tokens,
              cacheWriteTokens: usage.input_tokens_details.cache_write_tokens,
              raw: usage,
            },
          }
        : {}),
    };
    return { state: 'completed', result };
  } catch {
    return {
      state: 'failed',
      failure: {
        errorClass: 'invalid_output',
        code: 'OPENAI_INVALID_OUTPUT',
        retryable: true,
      },
    };
  }
}
function failed(
  code: string,
): Extract<GenerationSubmission, { state: 'failed' }> {
  return {
    state: 'failed',
    failure: { errorClass: 'model_unavailable', code, retryable: false },
  };
}
function failedPoll(
  code: string,
): Extract<GenerationPollResult, { state: 'failed' }> {
  return {
    state: 'failed',
    failure: { errorClass: 'model_unavailable', code, retryable: false },
  };
}
function nextPollAt(): Date {
  return new Date(Date.now() + POLL_MS);
}
