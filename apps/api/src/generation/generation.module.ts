import { Module } from '@nestjs/common';
import {
  GENERATION_PROVIDERS,
  GenerationProviderAdapter,
} from './adapters/generation-provider';
import { FakeGenerationProvider } from './adapters/fake-generation.provider';
import { AnthropicGenerationProvider } from './adapters/anthropic-generation.provider';
import { OpenAIGenerationProvider } from './adapters/openai-generation.provider';
import { GenerationHandlerRegistry } from './generation-handler.registry';
import { GenerationPolicyService } from './policy/generation-policy.service';
import { GenerationService } from './generation.service';
import { GenerationWorkerService } from './generation-worker.service';

@Module({
  providers: [
    GenerationPolicyService,
    GenerationHandlerRegistry,
    FakeGenerationProvider,
    AnthropicGenerationProvider,
    OpenAIGenerationProvider,
    {
      provide: GENERATION_PROVIDERS,
      inject: [
        FakeGenerationProvider,
        AnthropicGenerationProvider,
        OpenAIGenerationProvider,
      ],
      useFactory: (
        fake: FakeGenerationProvider,
        anthropic: AnthropicGenerationProvider,
        openai: OpenAIGenerationProvider,
      ): GenerationProviderAdapter[] => [fake, anthropic, openai],
    },
    GenerationService,
    GenerationWorkerService,
  ],
  exports: [
    GenerationPolicyService,
    GenerationHandlerRegistry,
    GenerationService,
  ],
})
export class GenerationModule {}
