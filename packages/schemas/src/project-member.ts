import { z } from 'zod';

// A project's member as shown to an admin managing the project, and as
// consumed by the client-facing Developer Card (features/projects/components/
// developer-card.tsx) — one row per apps/api ProjectMember, joined with the
// underlying User's display info.
export const ProjectMemberSchema = z.object({
  userId: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.email(),
  isAdmin: z.boolean(),
  role: z.enum(['client', 'contributor']),
  image: z.string().nullable(),
  roleTitle: z.string().nullable(),
  phone: z.string().nullable(),
  github: z.string().nullable(),
  linkedin: z.string().nullable(),
  malt: z.string().nullable(),
  website: z.string().nullable(),
});
export type ProjectMember = z.infer<typeof ProjectMemberSchema>;
