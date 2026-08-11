import { ConfigService } from '@nestjs/config';
import {
  GENERATION_OPERATION_TYPES,
  GenerationPolicyService,
} from './generation-policy.service';

const stageModels = {
  document_extraction: 'extract-v1',
  source_consolidation: 'consolidate-v1',
  factual_drafting: 'draft-v1',
  editorial_preview: 'preview-v1',
  client_derivation: 'derive-v1',
  output_validation: 'validate-v1',
} as const;

function route(
  provider: 'anthropic' | 'openai' | 'fake',
  model: string,
  transport: 'sync' | 'batch' = 'sync',
) {
  return {
    provider,
    model,
    transport,
    maxAttempts: 2,
    requestTimeoutMs: 30_000,
    remoteDeadlineMs: 120_000,
  };
}

function policy(overrides: Record<string, unknown> = {}) {
  return {
    version: 'test-v1',
    crossProviderFallbackEnabled: true,
    stages: Object.fromEntries(
      Object.entries(stageModels).map(([stage, model]) => [
        stage,
        { routes: [route('anthropic', model)] },
      ]),
    ),
    ...overrides,
  };
}

function service(
  value: unknown = policy(),
  credentials: Record<string, string | undefined> = {
    ANTHROPIC_API_KEY: 'sk-ant-test',
    OPENAI_API_KEY: 'sk-test',
  },
) {
  const env = {
    GENERATION_POLICY_JSON: JSON.stringify(value),
    ...credentials,
  };
  return new GenerationPolicyService(new ConfigService(env));
}

describe('GenerationPolicyService', () => {
  it('requires independently configurable routes for all six stages', () => {
    const configured = service();

    expect(GENERATION_OPERATION_TYPES).toHaveLength(6);
    for (const stage of GENERATION_OPERATION_TYPES) {
      expect(configured.snapshotFor(stage).routes[0]?.model).toBe(
        stageModels[stage],
      );
    }
  });

  it('supports a one-provider policy and ordered same-provider fallback', () => {
    const value = policy();
    value.stages.factual_drafting.routes = [
      route('anthropic', 'primary'),
      route('anthropic', 'secondary'),
    ];

    expect(
      service(value)
        .availableRoutesFor('factual_drafting')
        .map(({ model }) => model),
    ).toEqual(['primary', 'secondary']);
  });

  it('preserves cross-provider order when enabled and denies it when disabled', () => {
    const enabled = policy();
    enabled.stages.document_extraction.routes = [
      route('anthropic', 'primary', 'batch'),
      route('openai', 'fallback', 'batch'),
    ];
    expect(
      service(enabled)
        .availableRoutesFor('document_extraction')
        .map(({ provider }) => provider),
    ).toEqual(['anthropic', 'openai']);

    const disabled = {
      ...enabled,
      crossProviderFallbackEnabled: false,
    };
    expect(
      service(disabled)
        .availableRoutesFor('document_extraction')
        .map(({ provider }) => provider),
    ).toEqual(['anthropic']);
  });

  it('accepts both transports and enforces bounded explicit retries', () => {
    const value = policy();
    value.stages.document_extraction.routes = [
      route('anthropic', 'batch-model', 'batch'),
    ];
    value.stages.editorial_preview.routes = [
      route('anthropic', 'sync-model', 'sync'),
    ];
    expect(
      service(value).snapshotFor('document_extraction').routes[0],
    ).toMatchObject({ transport: 'batch', maxAttempts: 2 });
    expect(
      service(value).snapshotFor('editorial_preview').routes[0],
    ).toMatchObject({ transport: 'sync', maxAttempts: 2 });

    value.stages.editorial_preview.routes[0] = {
      ...route('anthropic', 'invalid'),
      maxAttempts: 0,
    };
    expect(() => service(value)).toThrow('GENERATION_POLICY_JSON');
  });

  it('produces a secret-free snapshot and isolates later stage changes', () => {
    const configured = service();
    const extractionBefore = configured.snapshotFor('document_extraction');
    const snapshotText = JSON.stringify(extractionBefore);

    expect(snapshotText).not.toContain('sk-ant-test');
    expect(snapshotText).not.toContain('sk-test');
    expect(snapshotText).not.toMatch(/apiKey|secret|credential/i);
    expect(configured.snapshotFor('editorial_preview').routes[0]?.model).toBe(
      'preview-v1',
    );

    const changed = policy();
    changed.stages.editorial_preview.routes = [
      route('anthropic', 'preview-v2'),
    ];
    expect(service(changed).snapshotFor('document_extraction')).toEqual(
      extractionBefore,
    );
    expect(
      service(changed).snapshotFor('editorial_preview').routes[0]?.model,
    ).toBe('preview-v2');
  });

  it('fails startup for invalid JSON, missing stages, or missing primary credentials', () => {
    expect(() => new GenerationPolicyService(new ConfigService({}))).toThrow(
      'GENERATION_POLICY_JSON is required',
    );
    expect(
      () =>
        new GenerationPolicyService(
          new ConfigService({ GENERATION_POLICY_JSON: '{' }),
        ),
    ).toThrow('GENERATION_POLICY_JSON');

    const incomplete = policy();
    delete (incomplete.stages as Record<string, unknown>).output_validation;
    expect(() => service(incomplete)).toThrow('GENERATION_POLICY_JSON');
    expect(() => service(policy(), { ANTHROPIC_API_KEY: undefined })).toThrow(
      'ANTHROPIC_API_KEY',
    );
    expect(() =>
      service(policy(), { ANTHROPIC_API_KEY: 'invalid-key' }),
    ).toThrow('ANTHROPIC_API_KEY');
  });

  it('supports a credential-free fake primary and exact route permission checks', () => {
    const value = policy();
    for (const stage of GENERATION_OPERATION_TYPES) {
      value.stages[stage].routes = [route('fake', `fake-${stage}`)];
    }
    const configured = service(value, {
      ANTHROPIC_API_KEY: undefined,
      OPENAI_API_KEY: undefined,
    });
    expect(
      configured.isCurrentlyPermitted('document_extraction', {
        provider: 'fake',
        model: 'fake-document_extraction',
        transport: 'sync',
      }),
    ).toBe(true);
    expect(
      configured.isCurrentlyPermitted('document_extraction', {
        provider: 'fake',
        model: 'wrong-model',
        transport: 'batch',
      }),
    ).toBe(false);
  });

  it('rejects placeholder and malformed credentials for either remote provider', () => {
    const openAiPrimary = policy();
    for (const stage of GENERATION_OPERATION_TYPES) {
      openAiPrimary.stages[stage].routes = [route('openai', 'gpt-test')];
    }
    expect(() =>
      service(openAiPrimary, {
        ANTHROPIC_API_KEY: 'sk-ant-test',
        OPENAI_API_KEY: 'sk-...',
      }),
    ).toThrow('OPENAI_API_KEY');
    expect(() =>
      service(policy(), {
        ANTHROPIC_API_KEY: 'short',
        OPENAI_API_KEY: 'sk-test',
      }),
    ).toThrow('ANTHROPIC_API_KEY');
  });

  it('treats a configured fallback with missing credentials as unavailable', () => {
    const value = policy();
    value.stages.source_consolidation.routes = [
      route('anthropic', 'primary'),
      route('openai', 'fallback'),
    ];

    const configured = service(value, {
      ANTHROPIC_API_KEY: 'sk-ant-test',
      OPENAI_API_KEY: undefined,
    });

    expect(
      configured
        .availableRoutesFor('source_consolidation')
        .map(({ provider }) => provider),
    ).toEqual(['anthropic']);
    expect(configured.unavailableRoutesFor('source_consolidation')).toEqual([
      expect.objectContaining({ provider: 'openai', model: 'fallback' }),
    ]);
  });
});
