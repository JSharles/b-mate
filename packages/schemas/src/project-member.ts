import { z } from 'zod';

// A project's member as shown to an admin managing the project — one row
// per apps/api ProjectMember, joined with the underlying User's display info.
export const ProjectMemberSchema = z.object({
  userId: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.email(),
  isAdmin: z.boolean(),
});
export type ProjectMember = z.infer<typeof ProjectMemberSchema>;
