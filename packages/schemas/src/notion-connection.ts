import { z } from 'zod';

// specs/012-project-settings. Mirrors apps/api's NotionConnection model,
// minus the token — never returned once stored (same convention as
// BoardConnectionSchema).
export const NotionConnectionStatusSchema = z.object({
  connected: z.boolean(),
  // The workspace (or, absent that, integration) name captured at connect
  // time — null only when nothing is connected. Surfaced on
  // NotionConnectionCard so "Connected" always shows *what* it's connected
  // to, mirroring BoardConnectionSchema's boardTitle (2026-08-08 critique, P1).
  workspaceName: z.string().nullable(),
});
export type NotionConnectionStatus = z.infer<typeof NotionConnectionStatusSchema>;

export const CreateNotionConnectionRequestSchema = z.object({
  token: z.string().min(1),
});
export type CreateNotionConnectionRequest = z.infer<typeof CreateNotionConnectionRequestSchema>;
