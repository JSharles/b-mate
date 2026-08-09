import { z } from 'zod';
import { ResourceCategoryKeySchema } from './resource-category';

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

// specs/014-category-sections data-model.md. A section is the unit a client
// reads and a contributor reviews: one per (document, category) pair the
// document actually addresses, holding the plain-language rewrite of what
// that document says about that category. It replaces 013's category
// *assignment*, which carried only a label — which is why every tab used to
// show the same documents.
//
// `id` is the section's own id: the target of approve/reject/move. `title`
// and `content` are already resolved to the caller's locale server-side from
// the stored en/fr pair, the same way 013's `label` was. A client-role caller
// only ever receives 'approved' sections — enforced API-side, mirroring how
// only 'published' resources reach them.
export const ResourceSectionStatusSchema = z.enum([
  'proposed',
  'approved',
  'rejected',
]);
export type ResourceSectionStatus = z.infer<typeof ResourceSectionStatusSchema>;

export const ResourceSectionSchema = z.object({
  id: z.string(),
  categoryKey: ResourceCategoryKeySchema,
  status: ResourceSectionStatusSchema,
  title: z.string(),
  content: z.string(),
});
export type ResourceSection = z.infer<typeof ResourceSectionSchema>;

// Re-files a mis-categorized section (contracts/resource-sections.md). Only
// the category changes — never the title or content (FR-015).
export const MoveResourceSectionRequestSchema = z.object({
  categoryKey: ResourceCategoryKeySchema,
});
export type MoveResourceSectionRequest = z.infer<
  typeof MoveResourceSectionRequestSchema
>;

// One response shape for both the list and the single-resource view — 014
// dropped the list/detail split. `sections` travels with the list, content
// included, which is what lets a client read under a category tab without
// navigating anywhere (FR-019); the old shape carried titles only, which is
// precisely why reading used to require a click.
//
// `vulgarizedTitle`/`vulgarizedContent` are gone: the whole-document rewrite
// they held is replaced by the sections themselves.
//
// originalFileUrl is a short-lived presigned URL, generated fresh per request
// — never persisted or cached client-side beyond the current page load. It is
// now populated on the list too, so an accordion block can offer the source
// document (FR-020); presigning is a local signature, not a call to storage.
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
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  sections: z.array(ResourceSectionSchema),
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
