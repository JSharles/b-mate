import { describe, expect, it } from "vitest";
import {
  AsyncOperationSchema,
  GenerationAttemptSchema,
  GenerationOperationSchema,
  GenerationPolicyRouteSchema,
  GenerationSafeFailureSchema,
} from "./generation";

const UUID = "00000000-0000-4000-8000-000000000001";
const FINGERPRINT = "a".repeat(64);

describe("generation contracts", () => {
  it("validates all six operation types and active acknowledgement states", () => {
    for (const type of [
      "document_extraction",
      "source_consolidation",
      "factual_drafting",
      "editorial_preview",
      "client_derivation",
      "output_validation",
    ]) {
      expect(
        GenerationOperationSchema.safeParse({
          id: UUID,
          projectId: UUID,
          type,
          status: "queued",
          deduplicationKey: `${type}:${UUID}`,
          inputFingerprint: FINGERPRINT,
          currentRouteIndex: 0,
          currentAttemptId: null,
        }).success,
      ).toBe(true);
    }
    expect(
      AsyncOperationSchema.parse({ operationId: UUID, status: "running" }),
    ).toBeDefined();
    expect(
      AsyncOperationSchema.safeParse({
        operationId: UUID,
        status: "succeeded",
      }).success,
    ).toBe(false);
  });

  it("validates provider-neutral routes and attempt accounting", () => {
    expect(
      GenerationPolicyRouteSchema.parse({
        provider: "fake",
        model: "deterministic-v1",
        transport: "sync",
        maxAttempts: 2,
        requestTimeoutMs: 30_000,
        remoteDeadlineMs: 120_000,
      }),
    ).toBeDefined();
    expect(
      GenerationAttemptSchema.parse({
        id: UUID,
        operationId: UUID,
        ordinal: 1,
        routeIndex: 0,
        provider: "fake",
        model: "deterministic-v1",
        transport: "sync",
        status: "succeeded",
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
      }),
    ).toBeDefined();
  });

  it("exposes stable failure codes without protected diagnostics", () => {
    expect(
      GenerationSafeFailureSchema.parse({
        code: "GENERATION_ROUTES_EXHAUSTED",
        retryable: false,
      }),
    ).toBeDefined();
    expect(
      GenerationSafeFailureSchema.safeParse({
        code: "GENERATION_ROUTES_EXHAUSTED",
        retryable: false,
        protectedDiagnostic: "provider request abc failed",
      }).success,
    ).toBe(false);
  });
});
