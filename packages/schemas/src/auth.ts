import { z } from 'zod';

// Mirrors the shape returned by apps/api's toPublicUser() (auth.controller.ts)
// — every User field except passwordHash.
export const UserSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.email(),
  accountKind: z.enum(['developer', 'client']),
  company: z.string().nullable(),
  address: z.string().nullable(),
  phone: z.string().nullable(),
  image: z.string().nullable(),
  bio: z.string().nullable(),
  github: z.string().nullable(),
  // Set once a developer authenticates via GitHub OAuth (specs/009); null
  // for client accounts and pre-existing password-based developer accounts.
  githubId: z.string().nullable(),
  socials: z.string().nullable(),
  roleTitle: z.string().nullable(),
  status: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const LoginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
