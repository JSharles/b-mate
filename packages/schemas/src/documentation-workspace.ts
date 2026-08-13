import { z } from "zod";

export const DocumentationWorkspaceSchema = z
  .object({
    priority: z.enum([
      "needs_action",
      "processing",
      "published",
      "empty",
      "no_sections",
      "needs_attention",
    ]),
    activeOperationCount: z.number().int().nonnegative(),
    // What the current reference document still leaves open. Counted, never
    // listed here: the points are answered where they appear, in the document
    // (specs/018, FR-016c).
    openPointCount: z.number().int().nonnegative(),
    pendingReviewCount: z.number().int().nonnegative(),
    failedOperationCount: z.number().int().nonnegative(),
    documentCount: z.number().int().nonnegative(),
    referenceNeedsRewrite: z.boolean(),
    currentReleaseId: z.uuid().nullable(),
    pendingReleaseId: z.uuid().nullable(),
    releaseProgress: z
      .object({
        ready: z.number().int().nonnegative(),
        expected: z.number().int().nonnegative(),
      })
      .nullable(),
    clientVisibility: z.enum([
      "nothing_published",
      "previous_version_visible",
      "current_version_visible",
    ]),
    changeToken: z.string().min(1),
    refreshAfterMs: z.number().int().min(5_000).max(60_000),
  })
  .strict();

export type DocumentationWorkspace = z.infer<
  typeof DocumentationWorkspaceSchema
>;
