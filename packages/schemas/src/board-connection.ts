import { z } from 'zod';

// A board a developer's GitHub PAT can see — returned by the preview step,
// nothing here is persisted until connect() is called.
export const AvailableBoardSchema = z.object({
  ownerLogin: z.string(),
  ownerType: z.enum(['User', 'Organization']),
  number: z.number().int().positive(),
  title: z.string(),
  url: z.url(),
});
export type AvailableBoard = z.infer<typeof AvailableBoardSchema>;

// `token` is optional as of specs/010-github-oauth-board-connection: the
// OAuth flow carries the token via a short-lived server-side cookie
// instead (research.md Decision 5) — only the legacy paste-a-PAT path
// still sends one in the request body (FR-007).
export const PreviewBoardConnectionRequestSchema = z.object({
  token: z.string().min(1).optional(),
});
export type PreviewBoardConnectionRequest = z.infer<typeof PreviewBoardConnectionRequestSchema>;

// estimateUnit (specs/008-current-task-progress FR-005b): how to interpret
// the board's numeric "Estimate" field as a duration. Optional — defaults
// to "days" server-side when omitted.
export const CreateBoardConnectionRequestSchema = z.object({
  token: z.string().min(1).optional(),
  ownerLogin: z.string(),
  ownerType: z.enum(['User', 'Organization']),
  number: z.number().int().positive(),
  estimateUnit: z.enum(['days', 'hours']).optional(),
});
export type CreateBoardConnectionRequest = z.infer<typeof CreateBoardConnectionRequestSchema>;

// Mirrors apps/api's BoardConnection model, minus the token — never
// returned once stored (see docs/PRODUCT.md and specs/005-github-project-connection FR-012).
export const BoardConnectionSchema = z.object({
  provider: z.literal('github'),
  boardOwnerLogin: z.string(),
  boardOwnerType: z.enum(['User', 'Organization']),
  boardNumber: z.number(),
  boardTitle: z.string(),
  boardUrl: z.url(),
  estimateUnit: z.enum(['days', 'hours']),
  // specs/010-github-oauth-board-connection FR-008 — true when the
  // background sweep detected the stored token was revoked/invalid.
  needsReconnect: z.boolean(),
});
export type BoardConnection = z.infer<typeof BoardConnectionSchema>;
