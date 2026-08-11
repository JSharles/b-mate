import { z } from "zod";
import { DocumentationCategoryKeySchema } from "./documentation-category";
import { DocumentationUuidSchema } from "./documentation-common";

export const PublicClientBlockSchema = z.object({
  type: z.enum(["paragraph", "bullet", "open_point"]),
  text: z.string().trim().min(1).max(20_000),
  openPointId: z.string().trim().min(1).max(128).nullable().optional(),
}).strict();

export const PublicClientCategorySchema = z.object({
  categoryKey: DocumentationCategoryKeySchema,
  blocks: z.array(PublicClientBlockSchema),
}).strict();

export const ClientReleaseStatusSchema = z.enum(["queued", "preparing", "validating", "ready", "published", "failed", "superseded"]);

export const ClientReleaseViewSchema = z.object({
  releaseId: DocumentationUuidSchema.nullable(),
  sequence: z.number().int().nonnegative(),
  status: ClientReleaseStatusSchema.nullable(),
  visibleToClient: z.boolean(),
  readyCategoryCount: z.number().int().nonnegative(),
  expectedCategoryCount: z.number().int().nonnegative(),
  categories: z.array(PublicClientCategorySchema),
  publishedAt: z.iso.datetime().nullable(),
}).strict();

export const ClientContentPreviewSchema = z.object({
  current: ClientReleaseViewSchema,
  pending: ClientReleaseViewSchema.nullable(),
}).strict();

export type PublicClientBlock = z.infer<typeof PublicClientBlockSchema>;
export type PublicClientCategory = z.infer<typeof PublicClientCategorySchema>;
export type ClientReleaseView = z.infer<typeof ClientReleaseViewSchema>;
export type ClientContentPreview = z.infer<typeof ClientContentPreviewSchema>;
