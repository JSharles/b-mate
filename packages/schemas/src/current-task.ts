import { z } from 'zod';

// Plain-language content vulgarized by the backend from a connected board's
// current task (see specs/007-current-task-vulgarization). No `url` — the
// client is never sent to GitHub to read the task (specs/006-current-task-fetch
// feedback: "un client n'aura jamais... a aller sur github").
// startedAt/estimatedCompletionAt/estimateConfidence: specs/008-current-task-progress.
// Resolved and persisted backend-side (board data > AI fallback) — the
// frontend only renders them, never re-derives the resolution or the
// confidence matrix itself. estimateConfidence is null iff
// estimatedCompletionAt is null (no estimate to attach confidence to).
// why/impact/status: 2026-08-09, replaces the old single `description` blob
// with named sections a client can scan (docs/PRODUCT.md "Working notes")
// — each independently nullable, since the source material may not support
// a truthful answer for every section (Constitution II, "Never fabricate").
export const CurrentTaskItemSchema = z.object({
  title: z.string(),
  why: z.string().nullable(),
  impact: z.string().nullable(),
  status: z.string().nullable(),
  updatedAt: z.string(),
  startedAt: z.string(),
  estimatedCompletionAt: z.string().nullable(),
  estimateConfidence: z.enum(['high', 'medium', 'low']).nullable(),
});
export type CurrentTaskItem = z.infer<typeof CurrentTaskItemSchema>;
