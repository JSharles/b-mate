import { z } from "zod";
import { DocumentationUuidSchema } from "./documentation-common";

export const GENERATION_OPERATION_TYPES = [
  "document_extraction",
  "source_consolidation",
  "factual_drafting",
  "editorial_preview",
  "client_derivation",
  "output_validation",
] as const;
export const GenerationOperationTypeSchema = z.enum(GENERATION_OPERATION_TYPES);

export const GenerationOperationStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_provider",
  "retry_scheduled",
  "succeeded",
  "needs_attention",
  "cancelled",
  "superseded",
]);

export const GenerationTransportSchema = z.enum(["sync", "batch"]);

export const GenerationAttemptStatusSchema = z.enum([
  "submitting",
  "submitted",
  "polling",
  "succeeded",
  "failed",
  "invalid_output",
  "abandoned_unknown",
  "cancelled",
]);

export const GenerationErrorClassSchema = z.enum([
  "transient",
  "rate_limited",
  "credit_exhausted",
  "model_unavailable",
  "invalid_request",
  "input_unprocessable",
  "invalid_output",
  "provider_terminal",
  "policy_denied",
  "unknown",
]);

export const GenerationPolicyRouteSchema = z
  .object({
    provider: z.string().trim().min(1).max(64),
    model: z.string().trim().min(1).max(128),
    transport: GenerationTransportSchema,
    maxAttempts: z.number().int().min(1).max(5),
    requestTimeoutMs: z.number().int().min(1_000).max(300_000),
    remoteDeadlineMs: z.number().int().min(1_000).max(86_400_000),
  })
  .strict()
  .refine(
    ({ remoteDeadlineMs, requestTimeoutMs }) =>
      remoteDeadlineMs >= requestTimeoutMs,
    { message: "Remote deadline must not precede the request timeout." },
  );

export const GenerationOperationSchema = z
  .object({
    id: DocumentationUuidSchema,
    projectId: DocumentationUuidSchema,
    type: GenerationOperationTypeSchema,
    status: GenerationOperationStatusSchema,
    deduplicationKey: z.string().trim().min(1).max(512),
    inputFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    currentRouteIndex: z.number().int().nonnegative(),
    currentAttemptId: DocumentationUuidSchema.nullable(),
  })
  .strict();

export const GenerationAttemptUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative(),
    cacheWriteTokens: z.number().int().nonnegative(),
  })
  .strict();

export const GenerationAttemptSchema = z
  .object({
    id: DocumentationUuidSchema,
    operationId: DocumentationUuidSchema,
    ordinal: z.number().int().positive(),
    routeIndex: z.number().int().nonnegative(),
    provider: z.string().trim().min(1).max(64),
    model: z.string().trim().min(1).max(128),
    transport: GenerationTransportSchema,
    status: GenerationAttemptStatusSchema,
    usage: GenerationAttemptUsageSchema.nullable().optional(),
    errorClass: GenerationErrorClassSchema.nullable().optional(),
    errorCode: z.string().trim().min(1).max(128).nullable().optional(),
    retryable: z.boolean().nullable().optional(),
  })
  .strict();

export const AsyncOperationSchema = z
  .object({
    operationId: DocumentationUuidSchema,
    status: z.enum([
      "queued",
      "running",
      "waiting_provider",
      "retry_scheduled",
    ]),
  })
  .strict();

export const MutationOutcomeSchema = z
  .object({
    status: z.enum(["completed", "queued"]),
    operationId: DocumentationUuidSchema.nullable().optional(),
  })
  .strict();

export const GenerationSafeFailureSchema = z
  .object({
    code: z.enum([
      "GENERATION_TEMPORARILY_DELAYED",
      "GENERATION_ROUTES_EXHAUSTED",
      "GENERATION_POLICY_BLOCKED",
      "DOCUMENT_UNREADABLE",
      "DOCUMENT_TYPE_UNSUPPORTED",
    ]),
    retryable: z.boolean(),
  })
  .strict();

export type GenerationOperationType = z.infer<
  typeof GenerationOperationTypeSchema
>;
export type GenerationOperation = z.infer<typeof GenerationOperationSchema>;
export type GenerationPolicyRoute = z.infer<typeof GenerationPolicyRouteSchema>;
export type GenerationAttempt = z.infer<typeof GenerationAttemptSchema>;
export type AsyncOperation = z.infer<typeof AsyncOperationSchema>;
export type MutationOutcome = z.infer<typeof MutationOutcomeSchema>;
export type GenerationSafeFailure = z.infer<typeof GenerationSafeFailureSchema>;
