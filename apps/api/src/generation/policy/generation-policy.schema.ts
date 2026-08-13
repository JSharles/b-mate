import { z } from 'zod';

export const GENERATION_POLICY_STAGE_KEYS = [
  // Writes the project's reference document from its documents and the
  // developer's notes, in one call (specs/018-canonical-source-reading).
  'reference_document',
  // Composes one author-defined section from the reference document
  // (specs/017-documentation-review-journey). `stages` is strict and every key
  // is required, so adding a key here obliges every deployment's
  // GENERATION_POLICY_JSON to declare a route for it before the API will boot.
  'section_composition',
  'client_derivation',
] as const;

export const GenerationPolicyStageKeySchema = z.enum(
  GENERATION_POLICY_STAGE_KEYS,
);

export const GenerationProviderKeySchema = z.enum([
  'anthropic',
  'openai',
  'fake',
]);

export const GenerationPolicyRouteSchema = z
  .object({
    provider: GenerationProviderKeySchema,
    model: z.string().trim().min(1).max(128),
    transport: z.enum(['sync', 'batch']),
    maxAttempts: z.number().int().min(1).max(5),
    requestTimeoutMs: z.number().int().min(1_000).max(300_000),
    remoteDeadlineMs: z.number().int().min(1_000).max(86_400_000),
  })
  .strict()
  .refine(
    ({ remoteDeadlineMs, requestTimeoutMs }) =>
      remoteDeadlineMs >= requestTimeoutMs,
    { message: 'remoteDeadlineMs must be at least requestTimeoutMs' },
  );

export const GenerationStagePolicySchema = z
  .object({ routes: z.array(GenerationPolicyRouteSchema).min(1).max(10) })
  .strict();

export const GenerationPolicySchema = z
  .object({
    version: z.string().trim().min(1).max(64),
    crossProviderFallbackEnabled: z.boolean(),
    stages: z
      .object(
        Object.fromEntries(
          GENERATION_POLICY_STAGE_KEYS.map((stage) => [
            stage,
            GenerationStagePolicySchema,
          ]),
        ) as Record<
          (typeof GENERATION_POLICY_STAGE_KEYS)[number],
          typeof GenerationStagePolicySchema
        >,
      )
      .strict(),
  })
  .strict();

export type GenerationPolicy = z.infer<typeof GenerationPolicySchema>;
export type GenerationPolicyStageKey = z.infer<
  typeof GenerationPolicyStageKeySchema
>;
export type GenerationProviderKey = z.infer<typeof GenerationProviderKeySchema>;
export type GenerationPolicyRoute = z.infer<typeof GenerationPolicyRouteSchema>;

export interface GenerationPolicySnapshot {
  version: string;
  stage: GenerationPolicyStageKey;
  crossProviderFallbackEnabled: boolean;
  routes: GenerationPolicyRoute[];
}

export const GenerationPolicySnapshotSchema = z
  .object({
    version: z.string().trim().min(1).max(64),
    stage: GenerationPolicyStageKeySchema,
    crossProviderFallbackEnabled: z.boolean(),
    routes: z.array(GenerationPolicyRouteSchema).min(1).max(10),
  })
  .strict();
