import { z } from 'zod';

// specs/011-project-resources. Mirrors apps/api's Resource model, minus
// anthropicBatchId (internal-only, never returned to the frontend) and
// addedByUserId/publishedByUserId (not surfaced in this iteration).
export const ResourceSourceSchema = z.enum(['upload', 'notion']);
export type ResourceSource = z.infer<typeof ResourceSourceSchema>;

export const ResourceStatusSchema = z.enum([
  'processing',
  'ready_for_review',
  'published',
  'failed',
]);
export type ResourceStatus = z.infer<typeof ResourceStatusSchema>;

// specs/013-ai-resource-categorization data-model.md. `id` is the
// ResourceCategoryAssignment's own id (the target for approve/reject calls),
// not the category's — a resource can carry several of these at once, each
// tracked independently. `label` is already resolved to the caller's own
// locale server-side (labelEn/labelFr), matching how vulgarizedTitle/
// vulgarizedContent are already locale-resolved rather than shipped as a
// pair. A client-role caller only ever receives 'approved' entries here —
// enforced API-side, mirroring how only 'published' resources reach them.
export const ResourceCategoryAssignmentStatusSchema = z.enum([
  'proposed',
  'approved',
  'rejected',
]);
export type ResourceCategoryAssignmentStatus = z.infer<
  typeof ResourceCategoryAssignmentStatusSchema
>;

export const ResourceCategorySchema = z.object({
  id: z.string(),
  categoryId: z.string(),
  key: z.string(),
  label: z.string(),
  status: ResourceCategoryAssignmentStatusSchema,
});
export type ResourceCategory = z.infer<typeof ResourceCategorySchema>;

// The response shape for both the list (tile) and detail views — list omits
// nothing here (the fields are all cheap; a resource without vulgarized
// content just has those fields null). originalFileUrl is a short-lived
// presigned URL, generated fresh per request (research.md Decision 6) —
// never persisted or cached client-side beyond the current page load.
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
  vulgarizedTitle: z.string().nullable(),
  vulgarizedContent: z.string().nullable(),
  failureReason: z.string().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  categories: z.array(ResourceCategorySchema),
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
