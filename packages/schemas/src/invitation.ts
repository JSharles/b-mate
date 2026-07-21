import { z } from 'zod';

// Mirrors apps/api's Invitation model (apps/api/prisma/schema.prisma).
export const InvitationSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  email: z.email(),
  role: z.enum(['client', 'contributor']),
  isAdmin: z.boolean(),
  token: z.string(),
  status: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type Invitation = z.infer<typeof InvitationSchema>;

export const CreateInvitationRequestSchema = z.object({
  email: z.email(),
});
export type CreateInvitationRequest = z.infer<typeof CreateInvitationRequestSchema>;

// Public details shown on the invite acceptance page, keyed by token.
export const InvitationDetailsSchema = z.object({
  email: z.email(),
  projectTitle: z.string(),
  accountExists: z.boolean(),
  status: z.enum(['invited', 'expired', 'accepted']),
});
export type InvitationDetails = z.infer<typeof InvitationDetailsSchema>;

export const AcceptInvitationRequestSchema = z.object({
  password: z.string().min(8),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
});
export type AcceptInvitationRequest = z.infer<typeof AcceptInvitationRequestSchema>;
