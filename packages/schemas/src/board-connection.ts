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

export const PreviewBoardConnectionRequestSchema = z.object({
  token: z.string().min(1),
});
export type PreviewBoardConnectionRequest = z.infer<typeof PreviewBoardConnectionRequestSchema>;

export const CreateBoardConnectionRequestSchema = z.object({
  token: z.string().min(1),
  ownerLogin: z.string(),
  ownerType: z.enum(['User', 'Organization']),
  number: z.number().int().positive(),
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
});
export type BoardConnection = z.infer<typeof BoardConnectionSchema>;
