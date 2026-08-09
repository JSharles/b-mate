import { z } from 'zod';

// Mirrors apps/api's ProjectDateFormat/ProjectLanguage enums
// (apps/api/prisma/schema.prisma).
export const ProjectDateFormatSchema = z.enum(['mdy', 'dmy', 'ymd']);
export type ProjectDateFormat = z.infer<typeof ProjectDateFormatSchema>;

export const ProjectLanguageSchema = z.enum(['en', 'fr']);
export type ProjectLanguage = z.infer<typeof ProjectLanguageSchema>;

// Mirrors apps/api's Project model (apps/api/prisma/schema.prisma).
export const ProjectSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.string().nullable(),
  progressPercentage: z.number().nullable(),
  // Not yet surfaced anywhere client-facing — see docs/PRODUCT.md "Working
  // notes" (meeting/discussion-summary feature, not yet scoped). Settings
  // lets a contributor fill it in today so it has somewhere to live.
  meetingUrl: z.string().nullable(),
  // Not yet consumed by any date-rendering or content-localization logic —
  // same "field exists before the feature that reads it" precedent as
  // meetingUrl above. Per-project, not per-user: a developer can work with
  // clients in several countries at once (2026-08-09).
  timezone: z.string().nullable(),
  dateFormat: ProjectDateFormatSchema.nullable(),
  language: ProjectLanguageSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof ProjectSchema>;

// GET /projects/:id's response: the project plus the caller's own membership
// (role/isAdmin) on it — used to decide what the project page shows them.
// GET /projects (the list) still returns plain ProjectSchema entries, since
// the dashboard grid has no per-project role-gated UI.
export const ProjectDetailSchema = ProjectSchema.extend({
  role: z.enum(['client', 'contributor']),
  isAdmin: z.boolean(),
});
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>;

export const CreateProjectRequestSchema = z.object({
  title: z.string().min(1),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const UpdateProjectRequestSchema = z.object({
  title: z.string().min(1).optional(),
  meetingUrl: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  dateFormat: ProjectDateFormatSchema.nullable().optional(),
  language: ProjectLanguageSchema.nullable().optional(),
});
export type UpdateProjectRequest = z.infer<typeof UpdateProjectRequestSchema>;
