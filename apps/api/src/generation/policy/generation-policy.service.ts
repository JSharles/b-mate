import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GENERATION_POLICY_STAGE_KEYS,
  GenerationPolicy,
  GenerationPolicyRoute,
  GenerationPolicySchema,
  GenerationPolicySnapshot,
  GenerationPolicyStageKey,
  GenerationProviderKey,
} from './generation-policy.schema';

export const GENERATION_OPERATION_TYPES = GENERATION_POLICY_STAGE_KEYS;

const CREDENTIAL_ENV: Partial<Record<GenerationProviderKey, string>> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

@Injectable()
export class GenerationPolicyService {
  private readonly policy: GenerationPolicy;
  private readonly availableProviders: ReadonlySet<GenerationProviderKey>;

  constructor(private readonly config: ConfigService) {
    this.policy = this.parsePolicy(
      config.get<string>('GENERATION_POLICY_JSON'),
    );
    this.availableProviders = this.readAvailableProviders();
    this.assertPrimaryCredentials();
  }

  snapshotFor(stage: GenerationPolicyStageKey): GenerationPolicySnapshot {
    const stagePolicy = this.policy.stages[stage];
    const primaryProvider = stagePolicy.routes[0].provider;
    const permittedRoutes = this.policy.crossProviderFallbackEnabled
      ? stagePolicy.routes
      : stagePolicy.routes.filter(
          ({ provider }) => provider === primaryProvider,
        );

    return {
      version: this.policy.version,
      stage,
      crossProviderFallbackEnabled: this.policy.crossProviderFallbackEnabled,
      routes: permittedRoutes.map((route) => ({ ...route })),
    };
  }

  availableRoutesFor(stage: GenerationPolicyStageKey): GenerationPolicyRoute[] {
    return this.snapshotFor(stage).routes.filter(({ provider }) =>
      this.availableProviders.has(provider),
    );
  }

  unavailableRoutesFor(
    stage: GenerationPolicyStageKey,
  ): GenerationPolicyRoute[] {
    return this.snapshotFor(stage).routes.filter(
      ({ provider }) => !this.availableProviders.has(provider),
    );
  }

  isCurrentlyPermitted(
    stage: GenerationPolicyStageKey,
    route: Pick<GenerationPolicyRoute, 'provider' | 'model' | 'transport'>,
  ): boolean {
    return this.availableRoutesFor(stage).some(
      (current) =>
        current.provider === route.provider &&
        current.model === route.model &&
        current.transport === route.transport,
    );
  }

  private parsePolicy(raw: string | undefined): GenerationPolicy {
    if (!raw) {
      throw new Error('GENERATION_POLICY_JSON is required.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new Error('GENERATION_POLICY_JSON must contain valid JSON.');
    }

    const result = GenerationPolicySchema.safeParse(parsed);
    if (!result.success) {
      const details = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      throw new Error(`GENERATION_POLICY_JSON is invalid: ${details}`);
    }
    return result.data;
  }

  private readAvailableProviders(): ReadonlySet<GenerationProviderKey> {
    const available = new Set<GenerationProviderKey>(['fake']);
    for (const provider of ['anthropic', 'openai'] as const) {
      const envName = CREDENTIAL_ENV[provider];
      const credential = envName ? this.config.get<string>(envName) : undefined;
      if (credential && this.isCredentialShapeValid(provider, credential)) {
        available.add(provider);
      }
    }
    return available;
  }

  private assertPrimaryCredentials(): void {
    for (const stage of GENERATION_POLICY_STAGE_KEYS) {
      const primaryProvider = this.policy.stages[stage].routes[0].provider;
      if (this.availableProviders.has(primaryProvider)) {
        continue;
      }
      const envName = CREDENTIAL_ENV[primaryProvider];
      throw new Error(
        `${envName ?? primaryProvider} is missing or invalid for primary generation stage ${stage}.`,
      );
    }
  }

  private isCredentialShapeValid(
    provider: Exclude<GenerationProviderKey, 'fake'>,
    credential: string,
  ): boolean {
    if (credential.includes('...') || credential.length < 7) {
      return false;
    }
    return provider === 'anthropic'
      ? credential.startsWith('sk-ant-')
      : credential.startsWith('sk-');
  }
}
