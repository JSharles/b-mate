import { classifyHttpFailure } from './generation-errors';
describe('generation failure classification', () => {
  it.each([
    [{ status: 429 }, 'rate_limited', true],
    [{ status: 402 }, 'credit_exhausted', false],
    [{ message: 'insufficient_quota' }, 'credit_exhausted', false],
    [{ status: 401 }, 'invalid_request', false],
    [{ status: 404 }, 'model_unavailable', true],
    [{ status: 422 }, 'invalid_request', false],
    [{ status: 529 }, 'model_unavailable', true],
    [{ status: 503 }, 'model_unavailable', true],
    [{ status: 408, message: 'timeout' }, 'transient', true],
  ] as const)('classifies %o', (error, errorClass, retryable) =>
    expect(classifyHttpFailure('openai', error)).toMatchObject({
      errorClass,
      retryable,
    }),
  );
});
