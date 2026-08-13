import { z } from "zod";
import { DocumentationUuidSchema } from "./documentation-common";
import { PublicMilestoneSchema } from "./documentation-sections";

export const PublicClientBlockSchema = z.object({
  type: z.enum(["paragraph", "bullet", "open_point"]),
  text: z.string().trim().min(1).max(20_000),
  openPointId: z.string().trim().min(1).max(128).nullable().optional(),
}).strict();

// Authored by the contributor and shown to the client as written: the system
// cannot translate a heading it did not choose (specs/017 Decision 7).
const PublicSectionIdentitySchema = {
  id: DocumentationUuidSchema,
  name: z.string().trim().min(1).max(120),
};

// Discriminated rather than inferred from which key is present: the renderer
// should not have to consult the section list to know what it is holding.
export const PublicClientSectionSchema = z.discriminatedUnion("kind", [
  z.object({
    ...PublicSectionIdentitySchema,
    kind: z.literal("prose"),
    blocks: z.array(PublicClientBlockSchema),
  }).strict(),
  z.object({
    ...PublicSectionIdentitySchema,
    kind: z.literal("roadmap"),
    milestones: z.array(PublicMilestoneSchema),
    // Where the project stands. It travels with the section rather than inside
    // the published content, because the developer moves it without composing
    // or approving anything (spec FR-007).
    currentMilestoneId: DocumentationUuidSchema.nullable(),
  }).strict(),
]);

export const ClientReleaseStatusSchema = z.enum(["queued", "preparing", "validating", "ready", "published", "failed", "superseded"]);

export const ClientReleaseViewSchema = z.object({
  releaseId: DocumentationUuidSchema.nullable(),
  sequence: z.number().int().nonnegative(),
  status: ClientReleaseStatusSchema.nullable(),
  visibleToClient: z.boolean(),
  readySectionCount: z.number().int().nonnegative(),
  expectedSectionCount: z.number().int().nonnegative(),
  sections: z.array(PublicClientSectionSchema),
  publishedAt: z.iso.datetime().nullable(),
}).strict();

export const ClientContentPreviewSchema = z.object({
  current: ClientReleaseViewSchema,
  pending: ClientReleaseViewSchema.nullable(),
}).strict();

export type PublicClientBlock = z.infer<typeof PublicClientBlockSchema>;
export type PublicClientSection = z.infer<typeof PublicClientSectionSchema>;
export type ClientReleaseView = z.infer<typeof ClientReleaseViewSchema>;
export type ClientContentPreview = z.infer<typeof ClientContentPreviewSchema>;
