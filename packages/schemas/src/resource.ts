import { z } from 'zod';

// specs/011-project-resources. Mirrors apps/api's Resource model, minus
// anthropicBatchId (internal-only, never returned to the frontend) and
// addedByUserId/publishedByUserId (not surfaced in this iteration).
export const ResourceSourceSchema = z.enum(['upload', 'notion']);
export type ResourceSource = z.infer<typeof ResourceSourceSchema>;

// specs/015: `ready_for_review` and `published` existed to serve a
// per-document publication step that no longer exists — validating a
// category's reference content is now the only act that makes anything
// client-visible (Q3). A document is received, absorbed, or it failed.
export const ResourceStatusSchema = z.enum([
  'pending',
  'absorbed',
  'failed',
]);
export type ResourceStatus = z.infer<typeof ResourceStatusSchema>;

// specs/015: a resource is now purely an *input*. Its material lives in the
// reference layer; nothing here is ever read by a client, and it carries no
// content of its own. What remains is what a contributor needs to manage the
// document itself — its identity, its original, and whether it was absorbed.
//
// originalFileUrl is a short-lived presigned URL, generated fresh per request
// — never persisted or cached client-side beyond the current page load.
export const ResourceSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  source: ResourceSourceSchema,
  status: ResourceStatusSchema,
  title: z.string(),
  originalFileUrl: z.url().nullable(),
  originalFileName: z.string().nullable(),
  originalFileMimeType: z.string().nullable(),
  notionPageUrl: z.url().nullable(),
  failureReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type Resource = z.infer<typeof ResourceSchema>;

// The upload request itself is multipart/form-data (a real file), not JSON —
// validated by a NestJS DTO on the API side (create-resource-upload.dto.ts),
// not this schema. Nothing to model here beyond the accepted-format/size
// constants both sides could reference, kept minimal for now.
export const RESOURCE_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const RESOURCE_ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
] as const;

// specs/012-project-settings: the Notion integration token is configured
// once, standalone, in Settings (see notion-connection.ts) — creating a
// Notion-sourced resource only ever needs the page URL.
export const CreateResourceNotionRequestSchema = z.object({
  pageUrl: z.url(),
});
export type CreateResourceNotionRequest = z.infer<typeof CreateResourceNotionRequestSchema>;
