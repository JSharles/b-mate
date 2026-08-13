import { ConfigService } from '@nestjs/config';
import {
  GENERATION_OPERATION_TYPES,
  GenerationPolicyService,
} from './generation-policy.service';

const stageModels = {
  client_derivation: 'derive-v1',
  section_composition: 'compose-v1',
  reference_document: 'reference-v1',
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
  it('requires independently configurable routes for every stage', () => {
    const configured = service();

    // Deliberately asserted against the fixture rather than a literal count:
    // a stage added to the enum without a route here should fail loudly, and
    // a hardcoded number turns that into a puzzle about which number is right.
    expect(GENERATION_OPERATION_TYPES).toHaveLength(
      Object.keys(stageModels).length,
    );
    for (const stage of GENERATION_OPERATION_TYPES) {
      expect(configured.snapshotFor(stage).routes[0]?.model).toBe(
        stageModels[stage],
      );
    }
  });

  it('supports a one-provider policy and ordered same-provider fallback', () => {
    const value = policy();
    value.stages.section_composition.routes = [
      route('anthropic', 'primary'),
      route('anthropic', 'secondary'),
    ];

    expect(
      service(value)
        .availableRoutesFor('section_composition')
        .map(({ model }) => model),
    ).toEqual(['primary', 'secondary']);
  });

  it('preserves cross-provider order when enabled and denies it when disabled', () => {
    const enabled = policy();
    enabled.stages.reference_document.routes = [
      route('anthropic', 'primary', 'batch'),
      route('openai', 'fallback', 'batch'),
    ];
    expect(
      service(enabled)
        .availableRoutesFor('reference_document')
        .map(({ provider }) => provider),
    ).toEqual(['anthropic', 'openai']);

    const disabled = {
      ...enabled,
      crossProviderFallbackEnabled: false,
    };
    expect(
      service(disabled)
        .availableRoutesFor('reference_document')
        .map(({ provider }) => provider),
    ).toEqual(['anthropic']);
  });

  it('accepts both transports and enforces bounded explicit retries', () => {
    const value = policy();
    value.stages.reference_document.routes = [
      route('anthropic', 'batch-model', 'batch'),
    ];
    value.stages.section_composition.routes = [
      route('anthropic', 'sync-model', 'sync'),
    ];
    expect(
      service(value).snapshotFor('reference_document').routes[0],
    ).toMatchObject({ transport: 'batch', maxAttempts: 2 });
    expect(
      service(value).snapshotFor('section_composition').routes[0],
    ).toMatchObject({ transport: 'sync', maxAttempts: 2 });

    value.stages.reference_document.routes[0] = {
      ...route('anthropic', 'invalid'),
      maxAttempts: 0,
    };
    expect(() => service(value)).toThrow('GENERATION_POLICY_JSON');
  });

  it('produces a secret-free snapshot and isolates later stage changes', () => {
    const configured = service();
    const referenceBefore = configured.snapshotFor('reference_document');
    const snapshotText = JSON.stringify(referenceBefore);

    expect(snapshotText).not.toContain('sk-ant-test');
    expect(snapshotText).not.toContain('sk-test');
    expect(snapshotText).not.toMatch(/apiKey|secret|credential/i);
    expect(configured.snapshotFor('reference_document').routes[0]?.model).toBe(
      'reference-v1',
    );

    const changed = policy();
    changed.stages.section_composition.routes = [
      route('anthropic', 'compose-v2'),
    ];
    expect(service(changed).snapshotFor('reference_document')).toEqual(
      referenceBefore,
    );
    expect(
      service(changed).snapshotFor('section_composition').routes[0]?.model,
    ).toBe('compose-v2');
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
    delete (incomplete.stages as Record<string, unknown>).client_derivation;
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
      configured.isCurrentlyPermitted('reference_document', {
        provider: 'fake',
        model: 'fake-reference_document',
        transport: 'sync',
      }),
    ).toBe(true);
    expect(
      configured.isCurrentlyPermitted('reference_document', {
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
    value.stages.section_composition.routes = [
      route('anthropic', 'primary'),
      route('openai', 'fallback'),
    ];

    const configured = service(value, {
      ANTHROPIC_API_KEY: 'sk-ant-test',
      OPENAI_API_KEY: undefined,
    });

    expect(
      configured
        .availableRoutesFor('section_composition')
        .map(({ provider }) => provider),
    ).toEqual(['anthropic']);
    expect(configured.unavailableRoutesFor('section_composition')).toEqual([
      expect.objectContaining({ provider: 'openai', model: 'fallback' }),
    ]);
  });
});
