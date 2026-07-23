import { z } from 'zod';

// Mirrors apps/api's Project model (apps/api/prisma/schema.prisma).
export const ProjectSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.string().nullable(),
  progressPercentage: z.number().nullable(),
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
