import type { GenerationProviderFailure } from './adapters/generation-provider';

export function classifyHttpFailure(
  provider: 'anthropic' | 'openai',
  error: unknown,
): GenerationProviderFailure {
  const candidate = error as {
    status?: number;
    code?: string;
    name?: string;
    message?: string;
    error?: { type?: string; code?: string };
  };
  const status = candidate.status;
  const text = [
    candidate.code,
    candidate.name,
    candidate.message,
    candidate.error?.type,
    candidate.error?.code,
  ]
    .filter(Boolean)
    .join(' ');
  const prefix = provider.toUpperCase();
  if (status === 429)
    return failure(
      'rate_limited',
      `${prefix}_RATE_LIMITED`,
      true,
      status,
      text,
    );
  if (status === 402 || /credit|billing|insufficient_quota/iu.test(text))
    return failure(
      'credit_exhausted',
      `${prefix}_CREDIT_EXHAUSTED`,
      false,
      status,
      text,
    );
  if (status === 401 || status === 403)
    return failure(
      'invalid_request',
      `${prefix}_AUTH_FAILED`,
      false,
      status,
      text,
    );
  if (status === 404 || /model.*(not|unavailable)/iu.test(text))
    return failure(
      'model_unavailable',
      `${prefix}_MODEL_UNAVAILABLE`,
      true,
      status,
      text,
    );
  if (status === 400 || status === 422)
    return failure(
      'invalid_request',
      `${prefix}_INVALID_REQUEST`,
      false,
      status,
      text,
    );
  if (status === 529 || (status !== undefined && status >= 500))
    return failure(
      'model_unavailable',
      `${prefix}_UNAVAILABLE`,
      true,
      status,
      text,
    );
  return failure('transient', `${prefix}_REQUEST_FAILED`, true, status, text);
}

function failure(
  errorClass: GenerationProviderFailure['errorClass'],
  code: string,
  retryable: boolean,
  httpStatus: number | undefined,
  diagnostic: string,
): GenerationProviderFailure {
  return {
    errorClass,
    code,
    retryable,
    ...(httpStatus === undefined ? {} : { httpStatus }),
    ...(diagnostic ? { protectedDiagnostic: diagnostic.slice(0, 2_000) } : {}),
  };
}
