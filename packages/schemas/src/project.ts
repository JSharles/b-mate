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

export const CreateProjectRequestSchema = z.object({
  title: z.string().min(1),
});
export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;
